import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { textHash } from '../../../common/hashing/canonical-hash';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { roadHashesAlreadyHeld } from './boot-seed.bolivia-road-network';
import { bcbStatisticsSchema, type BcbSeries } from '../schemas/bcb-statistics.schema';
import { readSeed } from './seed.utils';

/**
 * Carga las estadísticas del Banco Central de Bolivia publicadas en cuadernos.
 *
 * Son doce mil series y más de un millón de puntos. Cargarlos como una observación por
 * punto serían tres millones de filas que nadie va a citar una por una; cada serie entra
 * como UN bloque y lo que se cita es el cuaderno por su huella, la hoja y la columna o la
 * fila exactas. Por cada serie se siembran dos observaciones:
 *
 * - `BCB_STATISTIC_DATA`: los puntos, con su afirmación y su evidencia. Es lo que se
 *   desempaqueta, y solo de la serie que alguien abre.
 * - `BCB_STATISTIC_CATALOG`: nombre, unidad, frecuencia, primer y último período y cuántos
 *   puntos. Es una fila de un kilobyte y por eso el catálogo de doce mil se lee sin tocar
 *   un solo punto; metido en la observación grande, leer el nombre de cada serie
 *   descomprimiría todos sus puntos.
 *
 * Sin arreglo `measures`, como los precios exógenos: estas lecturas no son series del
 * panel diario ni del anual y no deben entrar en ellos.
 *
 * Un cuaderno que el BCB actualiza trae las mismas series con un punto más; la huella del
 * bloque cambia y entra como bloque nuevo. La vista se queda con el recibido más tarde y
 * el anterior queda como evidencia de lo que se publicó.
 */

const AGENT_CODE = 'BCB_STATISTICS';
const DIRECTORY = 'boot/bcb-statistics';
const CHUNK = 300;
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface Pending {
  readonly series: BcbSeries;
  readonly data: Record<string, unknown>;
  readonly dataHash: string;
  readonly catalog: Record<string, unknown>;
  readonly catalogHash: string;
}

function dataOf(series: BcbSeries): Record<string, unknown> {
  return {
    recordType: 'BCB_STATISTIC_DATA',
    dataCategory: 'BCB_STATISTIC_DATA',
    indicatorCode: series.indicatorCode,
    unit: series.unit,
    frequency: series.frequency,
    points: series.points,
  };
}

function catalogOf(series: BcbSeries, dataHash: string): Record<string, unknown> {
  const first = series.points[0]?.[0] ?? '';
  const last = series.points.at(-1)?.[0] ?? '';
  return {
    recordType: 'BCB_STATISTIC_CATALOG',
    dataCategory: 'BCB_STATISTIC_CATALOG',
    indicatorCode: series.indicatorCode,
    name: series.name,
    family: series.family,
    workbook: series.workbook,
    sheet: series.sheet,
    unit: series.unit,
    frequency: series.frequency,
    locator: series.locator,
    firstPeriod: first,
    lastPeriod: last,
    pointCount: series.points.length,
    // La huella de los puntos: si la serie se revisa, el catálogo cambia con ella.
    dataHash,
  };
}

function pendingOf(series: BcbSeries): Pending {
  const data = dataOf(series);
  const dataHash = rawPayloadHash(data);
  const catalog = catalogOf(series, dataHash);
  return { series, data, dataHash, catalog, catalogHash: rawPayloadHash(catalog) };
}

function assertionOf(entry: Pending): string {
  const { series } = entry;
  const first = series.points[0]?.[0];
  const last = series.points.at(-1)?.[0];
  // La huella de los puntos va en la afirmación: dos revisiones con el mismo nombre y el
  // mismo rango de fechas dirían lo mismo y la segunda se tomaría por repetida.
  return `BCB: ${series.name}${series.unit ? ` (${series.unit})` : ''}, ${series.points.length} puntos de ${first} a ${last} [${entry.dataHash.slice(0, 12)}].`;
}

function excerptOf(series: BcbSeries): string {
  const first = series.points[0];
  const last = series.points.at(-1);
  return `Fuente ${series.workbook}, «${series.sheet}», ${JSON.stringify(series.locator)}: ${first?.[0]} = ${first?.[1]}; ${last?.[0]} = ${last?.[1]}`;
}

async function reconcileArtifact(
  sourceId: string,
  first: Pending,
  transaction: Transaction,
): Promise<string> {
  const { series } = first;
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: series.upstreamSha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;
  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'XLSX',
      mimeType: XLSX,
      originalUri: series.sourceUrl,
      storageUri: series.sourceUrl,
      sha256: series.upstreamSha256,
      publicationDate: null,
      retrievedAt: new Date(series.retrievedAt),
      metadataJson: {
        publisher: 'Banco Central de Bolivia',
        dataset: series.workbook,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

async function writeBlock(
  block: readonly Pending[],
  sourceArtifactId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const receivedAt = (entry: Pending) => new Date(entry.series.retrievedAt);
  const observations = await RawObservationModel.bulkCreate(
    block.flatMap((entry) =>
      [
        [entry.data, entry.dataHash],
        [entry.catalog, entry.catalogHash],
      ].map(([payload, hash]) => ({
        agentRunId,
        sourceArtifactId,
        payloadJson: payload as Record<string, unknown>,
        payloadHash: hash as string,
        receivedAt: receivedAt(entry),
        processingStatus: 'NORMALIZED' as const,
        retryCount: 0,
      })),
    ),
    { transaction, returning: true },
  );
  // Una afirmación por serie, colgada de la observación de los puntos (la primera de
  // cada par). La observación de catálogo es metadato y no afirma nada por sí sola.
  const claims = block.map((entry, index) => {
    const assertion = assertionOf(entry);
    const eventDate = entry.series.points.at(-1)?.[0] ?? '';
    return {
      factClaimId: randomUUID(),
      agentRunId,
      rawObservationId: observations[index * 2]?.rawObservationId ?? '',
      claimType: 'INDICATOR_READING' as const,
      assertion,
      eventDate,
      confidenceLevel: 'HIGH' as const,
      confidenceScore: '0.9000',
      impactLevel: 'MEDIUM' as const,
      timeHorizon: 'SHORT_TERM' as const,
      status: 'PUBLISHED' as const,
      contentHash: claimContentHash({ claimType: 'INDICATOR_READING', assertion, eventDate }),
      createdAt: new Date(),
    };
  });
  await FactClaimModel.bulkCreate(claims, { transaction });
  await ClaimEvidenceModel.bulkCreate(
    claims.map((claim, index) => {
      const entry = block[index];
      const excerpt = entry ? excerptOf(entry.series) : claim.assertion;
      return {
        factClaimId: claim.factClaimId,
        sourceArtifactId,
        excerpt,
        excerptHash: textHash(excerpt),
        locator: entry?.series.sourceUrl ?? '',
        retrievedAt: new Date(entry?.series.retrievedAt ?? Date.now()),
      };
    }),
    { transaction },
  );
}

export async function reconcileBcbStatistics(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  const names = (await readdir(resolve(__dirname, '..', DIRECTORY)))
    // Los que empiezan con guion bajo son el estado del recolector, no series.
    .filter((name) => name.endsWith('.json') && !name.startsWith('_'))
    .sort();
  for (const name of names) {
    const seed = await readSeed(`${DIRECTORY}/${name}`, bcbStatisticsSchema);
    const entries = seed.series.map(pendingOf);
    const held = await roadHashesAlreadyHeld(
      entries.map((entry) => entry.dataHash),
      transaction,
    );

    // Un cuaderno es un artefacto: las cientos de series de una hoja entran a una sola.
    const byArtifact = new Map<string, Pending[]>();
    for (const entry of entries) {
      if (held.has(entry.dataHash)) continue;
      held.add(entry.dataHash);
      const own = byArtifact.get(entry.series.upstreamSha256);
      if (own) own.push(entry);
      else byArtifact.set(entry.series.upstreamSha256, [entry]);
    }
    for (const pending of byArtifact.values()) {
      const first = pending[0];
      if (!first) continue;
      const sourceArtifactId = await reconcileArtifact(sourceId, first, transaction);
      for (let start = 0; start < pending.length; start += CHUNK) {
        await writeBlock(
          pending.slice(start, start + CHUNK),
          sourceArtifactId,
          agentRunId,
          transaction,
        );
      }
    }
  }
}
