import { createHash, randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { claimContentHash } from '../../../common/intelligence/claim-normalizer';
import { ungroundedMeasures } from '../../../common/economic-indicators/indicator-codes';
import type { AnnualRegisterSeries } from '../schemas/annual-register.schema';

/**
 * Por qué estas cargas van por lotes y no punto por punto.
 *
 * El sembrador de registros anuales hacía cinco consultas secuenciales por cada
 * lectura: buscar si ya estaba, buscar su archivo de origen, crear la
 * observación, crear la afirmación y crear la evidencia. Con los tres cuadros de
 * cuentas regionales eran dos mil doscientas lecturas y no se notaba. Con la
 * apertura por actividad son treinta y siete mil más: del orden de doscientos
 * mil viajes de ida y vuelta a PostgreSQL, uno detrás de otro y todos dentro de
 * una misma transacción. En el servidor de casa terminaba en algo menos de una
 * hora; en el compartido, no terminaba: la siembra se quedaba a medias y el
 * capítulo salía vacío en verde, que es el fallo caro de este repositorio.
 *
 * Tres cambios, y ninguno toca lo que se escribe:
 *
 * 1. **El archivo de origen se recuerda.** Treinta y siete mil lecturas citan
 *    treinta cuadernos, así que treinta y siete mil búsquedas por huella eran
 *    treinta búsquedas repetidas mil veces cada una.
 * 2. **La comprobación de «ya estaba» se hace por lote.** Una consulta con las
 *    cuatrocientas huellas del lote sustituye cuatrocientas consultas de una.
 *    En una resiembra —donde todo está ya— eso convierte la corrida entera en
 *    unas pocas decenas de consultas.
 * 3. **Las tres escrituras se hacen en bloque.** `bulkCreate` con `returning`
 *    devuelve las observaciones en el mismo orden en que se mandaron, que es lo
 *    que permite colgar de cada una su afirmación sin volver a preguntar por su
 *    identificador.
 *
 * **Lo que NO cambia es la carga que se escribe.** El `payloadJson` se arma
 * igual y su huella es la misma, que es de lo que depende la idempotencia: una
 * fila que entró con el sembrador anterior se reconoce con éste y no se
 * duplica. Cambiar un campo del payload aquí habría hecho que toda la historia
 * volviera a entrar como si fuera nueva.
 */

/**
 * Cuántas lecturas van juntas.
 *
 * Cuatrocientas es el tamaño de la serie más larga del corpus, así que un lote
 * nunca parte una serie por la mitad y el `IN` de la comprobación se queda muy
 * por debajo del límite de parámetros de PostgreSQL.
 */
export const CHUNK = 400;

type RegisterPoint = AnnualRegisterSeries['points'][number];

/** Una lectura lista para escribirse, con su carga ya armada y pesada. */
export interface QueuedPoint {
  series: AnnualRegisterSeries;
  point: RegisterPoint;
  payload: Record<string, unknown>;
  payloadHash: string;
}

/** Lo que una carga necesita saber, y lo que va recordando por el camino. */
export interface RegisterContext {
  sourceId: string;
  agentRunId: string;
  transaction: Transaction;
  /** Huella del cuaderno descargado, contra el identificador de su artefacto. */
  artifacts: Map<string, string>;
}

/**
 * El artefacto de un cuaderno, buscado una vez y recordado.
 *
 * El tipo del archivo descargado, no el del extracto: las cuentas y las
 * exportaciones son cuadernos de cálculo y el registro empresarial son dos
 * páginas. Decirlo aquí es lo que permite que quien audite sepa con qué abrir
 * lo que se citó.
 */
async function artifactFor(
  context: RegisterContext,
  series: AnnualRegisterSeries,
  point: RegisterPoint,
): Promise<string> {
  const remembered = context.artifacts.get(point.upstreamSha256);
  if (remembered !== undefined) return remembered;

  const existing = await SourceArtifactModel.findOne({
    where: { sha256: point.upstreamSha256 },
    transaction: context.transaction,
  });
  if (existing) {
    context.artifacts.set(point.upstreamSha256, existing.sourceArtifactId);
    return existing.sourceArtifactId;
  }

  const workbook = point.sourceUrl.includes('nube.ine.gob.bo');
  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId: context.sourceId,
      artifactType: workbook ? 'XLSX' : 'HTML',
      originalUri: point.sourceUrl,
      storageUri: point.sourceUrl,
      mimeType: workbook
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/html',
      sha256: point.upstreamSha256,
      retrievedAt: new Date(point.retrievedAt),
      metadataJson: {
        publisher: series.publisher,
        indicatorCode: series.indicatorCode,
        indicatorName: series.name,
        group: series.group,
        level: series.level,
        frequency: series.frequency,
        period: point.period,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction: context.transaction },
  );
  context.artifacts.set(point.upstreamSha256, sourceArtifactId);
  return sourceArtifactId;
}

/** Las huellas del lote que la base ya tiene, en una sola consulta. */
async function alreadyFiled(
  context: RegisterContext,
  queued: readonly QueuedPoint[],
): Promise<Set<string>> {
  const hashes = [...new Set(queued.map((one) => one.payloadHash))];
  const present = await RawObservationModel.findAll({
    attributes: ['payloadHash'],
    where: { payloadHash: { [Op.in]: hashes } },
    transaction: context.transaction,
  });
  return new Set(present.map((row) => row.payloadHash));
}

/**
 * Escribe un lote: las observaciones, sus afirmaciones y sus evidencias.
 *
 * La comprobación de anclaje se mantiene lectura por lectura y antes de
 * escribir nada, porque es la regla que la vía de ingesta aplica y no una
 * optimización: una cifra ausente del registro que se guarda como prueba no es
 * una lectura, y detener la corrida es lo correcto.
 */
export async function writeChunk(
  context: RegisterContext,
  queued: readonly QueuedPoint[],
): Promise<number> {
  if (!queued.length) return 0;
  const filed = await alreadyFiled(context, queued);

  const seen = new Set<string>();
  const fresh = queued.filter((one) => {
    if (filed.has(one.payloadHash) || seen.has(one.payloadHash)) return false;
    seen.add(one.payloadHash);
    return true;
  });
  if (!fresh.length) return 0;

  for (const one of fresh) {
    const measures = (one.payload as { measures: Parameters<typeof ungroundedMeasures>[0] })
      .measures;
    const ungrounded = ungroundedMeasures(measures, one.point.excerpt);
    if (ungrounded.length) {
      throw new Error(
        `${one.series.indicatorCode} ${one.point.period}: cifras ausentes del registro citado: ${ungrounded.join(', ')}`,
      );
    }
  }

  const artifacts: string[] = [];
  for (const one of fresh) artifacts.push(await artifactFor(context, one.series, one.point));

  const observations = await RawObservationModel.bulkCreate(
    fresh.map((one, index) => ({
      agentRunId: context.agentRunId,
      sourceArtifactId: artifacts[index] ?? null,
      payloadJson: one.payload,
      payloadHash: one.payloadHash,
      receivedAt: new Date(one.point.retrievedAt),
      processingStatus: 'NORMALIZED',
      retryCount: 0,
    })),
    { transaction: context.transaction, returning: true },
  );

  const claims = fresh.map((one, index) => {
    const assertion = `${one.series.name} en ${one.point.period}: ${one.point.value} ${one.series.unit}, segun ${one.series.publisher}.`;
    const eventDate = `${one.point.period}-12-31`;
    return {
      factClaimId: randomUUID(),
      agentRunId: context.agentRunId,
      rawObservationId: observations[index]?.rawObservationId ?? null,
      claimType: 'INDICATOR_READING',
      assertion,
      eventDate,
      confidenceLevel: 'HIGH',
      confidenceScore: '0.9000',
      impactLevel: 'HIGH',
      timeHorizon: 'STRUCTURAL',
      status: 'PUBLISHED',
      contentHash: claimContentHash({ claimType: 'INDICATOR_READING', assertion, eventDate }),
      createdAt: new Date(),
    };
  });
  await FactClaimModel.bulkCreate(claims, { transaction: context.transaction });

  await ClaimEvidenceModel.bulkCreate(
    fresh.map((one, index) => ({
      factClaimId: claims[index]?.factClaimId ?? randomUUID(),
      sourceArtifactId: artifacts[index] ?? '',
      excerpt: one.point.excerpt,
      excerptHash: createHash('sha256').update(one.point.excerpt).digest('hex'),
      locator: one.point.sourceUrl,
      retrievedAt: new Date(one.point.retrievedAt),
    })),
    { transaction: context.transaction },
  );

  return fresh.length;
}
