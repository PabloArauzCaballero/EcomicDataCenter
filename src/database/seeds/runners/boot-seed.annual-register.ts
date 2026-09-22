import { createHash, randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { ungroundedMeasures } from '../../../common/economic-indicators/indicator-codes';
import { annualRegisterSchema, type AnnualRegisterSeries } from '../schemas/annual-register.schema';
import { readSeed } from './seed.utils';

/**
 * Carga las series anuales que pertenecen a un sitio o a alguien.
 *
 * Tres archivos y un solo cargador, porque los tres tienen la misma forma y el
 * mismo problema: son un cuadro de dos entradas —una dimensión que el corpus no
 * tenía, cruzada con los años— y la vista anual del observatorio archiva por
 * `indicator_code` sin columna para esa dimensión. El esquema explica por qué
 * la dimensión viaja dentro del código y repetida en claro.
 *
 * Lo que traen:
 *
 * - **Las cuentas regionales.** Seis medidas del INE por cada uno de los nueve
 *   departamentos y por el país, de 1988 a 2024. Hasta aquí el observatorio
 *   medía un solo Bolivia, y en esa cifra Tarija perdiendo el gas y La Paz
 *   ganando el oro se cancelaban hasta parecer quietud.
 * - **Las exportaciones por departamento y producto.** Lo que cada
 *   departamento vende, en dólares y en toneladas, de 2010 en adelante.
 * - **El registro empresarial.** Quién exportó más en 2024 y quién está mejor
 *   visto según Merco. De lo primero se carga el puesto y la cuota y **no los
 *   dólares**, por lo que `corporate-sources` explica: el total de esa fuente
 *   no cuadra con el del INE y su base no está declarada.
 *
 * Cada punto lleva su procedencia porque una descarga trae un cuadro entero:
 * las diez filas de un cuadro del INE citan el mismo archivo y la misma huella,
 * y el artefacto se concilia por esa huella para que la descarga entre una vez
 * y no diez. Es lo mismo que hace el sembrador de partidas arancelarias, y por
 * la misma razón.
 */

/**
 * Los archivos, con quién los recogió y con qué categoría entran al corpus.
 *
 * Dos identidades y no una, aunque el cargador sea uno solo: los dos primeros
 * archivos salen del colector del INE y el tercero de otro que lee dos
 * publicaciones privadas. Un auditor que abra una fila de Potosí y una de una
 * exportadora tiene que ver dos corridas distintas, porque son dos
 * procedencias distintas; meterlas bajo un mismo agente ahorraría una entrada
 * de catálogo y borraría esa diferencia.
 *
 * La categoría no decide nada aguas abajo —el rubro lo pone la vista anual por
 * el prefijo del código— pero queda en la observación cruda, que es lo que
 * alguien lee cuando audita de dónde salió una fila sin el tablero delante.
 */
const REGISTERS: ReadonlyArray<{
  readonly file: string;
  readonly agentCode: string;
  readonly dataCategory: string;
}> = [
  {
    file: 'boot/department-accounts.json',
    agentCode: 'INE_DEPARTMENTS_BACKFILL',
    dataCategory: 'REGIONAL_ACCOUNTS',
  },
  {
    file: 'boot/department-exports.json',
    agentCode: 'INE_DEPARTMENTS_BACKFILL',
    dataCategory: 'FOREIGN_TRADE',
  },
  {
    file: 'boot/corporate-register.json',
    agentCode: 'CORPORATE_REGISTER_BACKFILL',
    dataCategory: 'CORPORATE_REGISTER',
  },
];

type RegisterPoint = AnnualRegisterSeries['points'][number];

async function reconcilePointArtifact(
  series: AnnualRegisterSeries,
  point: RegisterPoint,
  sourceId: string,
  transaction: Transaction,
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: point.upstreamSha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      /*
       * El tipo del archivo descargado, no el del extracto.
       *
       * Las cuentas y las exportaciones son cuadernos de cálculo; el registro
       * empresarial son dos páginas. Decirlo aquí es lo que permite que alguien
       * que audite sepa con qué abrir lo que se citó.
       */
      artifactType: point.sourceUrl.includes('nube.ine.gob.bo') ? 'XLSX' : 'HTML',
      originalUri: point.sourceUrl,
      storageUri: point.sourceUrl,
      mimeType: point.sourceUrl.includes('nube.ine.gob.bo')
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
    { transaction },
  );
  return sourceArtifactId;
}

/**
 * La carga de un año.
 *
 * `eventDate` cierra el año en vez de abrirlo, como cualquier otra cifra anual
 * de este corpus: un total de un año sólo se conoce cuando el año terminó, y
 * quien ordene por fecha no debería encontrárselo antes.
 */
function annualPayload(
  series: AnnualRegisterSeries,
  point: RegisterPoint,
  dataCategory: string,
): Record<string, unknown> {
  return {
    recordType: 'PERIOD_INDICATOR',
    dataCategory,
    eventDate: `${point.period}-12-31`,
    period: point.period,
    frequency: series.frequency,
    measures: [
      {
        indicatorCode: series.indicatorCode,
        priceSide: null,
        value: point.value,
        unit: series.unit,
      },
    ],
    indicatorName: series.name,
    compilerCode: `${series.group}_${series.level}`,
    publisher: series.publisher,
    publisherVerified: true,
    url: point.sourceUrl,
    sha256: point.upstreamSha256,
    storageUri: point.sourceUrl,
  };
}

async function reconcilePoint(
  series: AnnualRegisterSeries,
  point: RegisterPoint,
  dataCategory: string,
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const payload = annualPayload(series, point, dataCategory);
  const payloadHash = rawPayloadHash(payload);
  const present = await RawObservationModel.findOne({
    attributes: ['rawObservationId'],
    where: { payloadHash },
    transaction,
  });
  if (present) return;

  // La misma regla que aplica la vía de ingesta: una cifra ausente del registro
  // que se guarda como prueba no es una lectura.
  const measures = (payload as { measures: Parameters<typeof ungroundedMeasures>[0] }).measures;
  const ungrounded = ungroundedMeasures(measures, point.excerpt);
  if (ungrounded.length) {
    throw new Error(
      `${series.indicatorCode} ${point.period}: cifras ausentes del registro citado: ${ungrounded.join(', ')}`,
    );
  }

  const sourceArtifactId = await reconcilePointArtifact(series, point, sourceId, transaction);
  const observation = await RawObservationModel.create(
    {
      agentRunId,
      sourceArtifactId,
      payloadJson: payload,
      payloadHash,
      receivedAt: new Date(point.retrievedAt),
      processingStatus: 'NORMALIZED',
      retryCount: 0,
    },
    { transaction },
  );

  const assertion = `${series.name} en ${point.period}: ${point.value} ${series.unit}, segun ${series.publisher}.`;
  const eventDate = `${point.period}-12-31`;
  const factClaimId = randomUUID();
  await FactClaimModel.create(
    {
      factClaimId,
      agentRunId,
      rawObservationId: observation.rawObservationId,
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
    },
    { transaction },
  );

  await ClaimEvidenceModel.create(
    {
      factClaimId,
      sourceArtifactId,
      excerpt: point.excerpt,
      excerptHash: createHash('sha256').update(point.excerpt).digest('hex'),
      locator: point.sourceUrl,
      retrievedAt: new Date(point.retrievedAt),
    },
    { transaction },
  );
}

export async function reconcileAnnualRegisters(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const runs = new Map<string, string>();
  for (const register of REGISTERS) {
    let agentRunId = runs.get(register.agentCode);
    if (agentRunId === undefined) {
      agentRunId = await reconcileHistoryRun(register.agentCode, transaction);
      runs.set(register.agentCode, agentRunId);
    }
    const loaded = await readSeed(register.file, annualRegisterSchema);
    for (const series of loaded.series) {
      for (const point of series.points) {
        await reconcilePoint(
          series,
          point,
          register.dataCategory,
          sourceId,
          agentRunId,
          transaction,
        );
      }
    }
  }
}
