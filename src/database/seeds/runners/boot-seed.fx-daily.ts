import { createHash, randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import {
  ungroundedMeasures,
  type IndicatorMeasure,
} from '../../../common/economic-indicators/indicator-codes';
import { fxDailySchema, type FxDailyReading } from '../schemas/fx-daily.schema';
import { readSeed } from './seed.utils';

/**
 * Carga el dólar oficial y el paralelo que `yarn fx:collect` acumula día a día.
 *
 * Continúa las series de `exchange-rate-history`, que terminan el 23 de agosto
 * de 2026, con la misma fuente y la misma agregación diaria. Existe porque esas
 * dos series solo llegaban por la API del recolector, que escribe en una sola
 * base; ver el esquema.
 *
 * Se escribe con los mismos agentes que esas cargas históricas, porque es la
 * misma fuente leída de la misma forma (`chart-export-1d`), solo que un día
 * cada vez.
 *
 * Idempotente por la huella del contenido, como los demás: cada lectura lleva
 * su propia procedencia, así que añadir un día no cambia la huella de los ya
 * guardados y una segunda corrida no escribe nada.
 */

const AGENT_CODES = {
  FX_PARALLEL_USD_BOB: 'FX_PARALLEL_HISTORY_BACKFILL',
  FX_OFFICIAL_USD_BOB: 'FX_OFFICIAL_HISTORY_BACKFILL',
} as const;

async function reconcileArtifact(
  reading: FxDailyReading,
  sourceId: string,
  cache: Map<string, string>,
  transaction: Transaction,
): Promise<string> {
  const cached = cache.get(reading.documentSha256);
  if (cached) return cached;

  const existing = await SourceArtifactModel.findOne({
    where: { sha256: reading.documentSha256 },
    transaction,
  });
  if (existing) {
    cache.set(reading.documentSha256, existing.sourceArtifactId);
    return existing.sourceArtifactId;
  }

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'JSON',
      originalUri: reading.sourceUrl,
      storageUri: reading.sourceUrl,
      mimeType: 'application/json',
      sha256: reading.documentSha256,
      retrievedAt: new Date(reading.retrievedAt),
      metadataJson: {
        publisher: reading.publisher,
        ...(reading.originator ? { originator: reading.originator } : {}),
        aggregation: 'DAILY_AVERAGE',
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  cache.set(reading.documentSha256, sourceArtifactId);
  return sourceArtifactId;
}

function measureOf(reading: FxDailyReading): IndicatorMeasure {
  return {
    indicatorCode: reading.indicatorCode,
    priceSide: reading.priceSide,
    value: reading.value,
    unit: reading.unit,
  };
}

/** Carga de una lectura, con la forma de la que envía el recolector. */
function dailyPayload(reading: FxDailyReading): Record<string, unknown> {
  return {
    recordType: 'DAILY_INDICATOR',
    dataCategory: reading.indicatorCode === 'FX_OFFICIAL_USD_BOB' ? 'FX_OFFICIAL' : 'FX_PARALLEL',
    eventDate: reading.eventDate,
    aggregation: 'DAILY_AVERAGE',
    measures: [measureOf(reading)],
    publisher: reading.publisher,
    publisherVerified: true,
    url: reading.sourceUrl,
    sha256: reading.documentSha256,
    storageUri: reading.sourceUrl,
  };
}

export async function reconcileFxDaily(sourceId: string, transaction: Transaction): Promise<void> {
  const seed = await readSeed('boot/fx-daily.json', fxDailySchema);
  const agentRuns = {
    FX_PARALLEL_USD_BOB: await reconcileHistoryRun(AGENT_CODES.FX_PARALLEL_USD_BOB, transaction),
    FX_OFFICIAL_USD_BOB: await reconcileHistoryRun(AGENT_CODES.FX_OFFICIAL_USD_BOB, transaction),
  };

  const entries = seed.readings.map((reading) => ({ reading, payload: dailyPayload(reading) }));
  const hashes = entries.map((entry) => rawPayloadHash(entry.payload));

  const present = new Set<string>();
  for (let start = 0; start < hashes.length; start += 500) {
    const rows = await RawObservationModel.findAll({
      attributes: ['payloadHash'],
      where: { payloadHash: { [Op.in]: hashes.slice(start, start + 500) } },
      transaction,
    });
    for (const row of rows) present.add(row.payloadHash);
  }

  const artifacts = new Map<string, string>();
  for (const [index, entry] of entries.entries()) {
    const payloadHash = hashes[index];
    if (!payloadHash || present.has(payloadHash)) continue;

    const { reading } = entry;
    const agentRunId = agentRuns[reading.indicatorCode];
    const ungrounded = ungroundedMeasures([measureOf(reading)], reading.excerpt);
    if (ungrounded.length) {
      throw new Error(
        `fx-daily ${reading.indicatorCode} ${reading.eventDate}: cifras ausentes del fragmento citado: ${ungrounded.join(', ')}`,
      );
    }

    const sourceArtifactId = await reconcileArtifact(reading, sourceId, artifacts, transaction);
    const observation = await RawObservationModel.create(
      {
        agentRunId,
        sourceArtifactId,
        payloadJson: entry.payload,
        payloadHash,
        receivedAt: new Date(reading.retrievedAt),
        processingStatus: 'NORMALIZED',
        retryCount: 0,
      },
      { transaction },
    );

    const { assertion } = reading;
    const factClaimId = randomUUID();
    await FactClaimModel.create(
      {
        factClaimId,
        agentRunId,
        rawObservationId: observation.rawObservationId,
        claimType: 'INDICATOR_READING',
        assertion,
        eventDate: reading.eventDate,
        confidenceLevel: 'HIGH',
        confidenceScore: '0.8500',
        impactLevel: 'HIGH',
        timeHorizon: 'IMMEDIATE',
        status: 'PUBLISHED',
        contentHash: claimContentHash({
          claimType: 'INDICATOR_READING',
          assertion,
          eventDate: reading.eventDate,
        }),
        createdAt: new Date(),
      },
      { transaction },
    );

    await ClaimEvidenceModel.create(
      {
        factClaimId,
        sourceArtifactId,
        excerpt: reading.excerpt,
        excerptHash: createHash('sha256').update(reading.excerpt).digest('hex'),
        locator: reading.sourceUrl,
        retrievedAt: new Date(reading.retrievedAt),
      },
      { transaction },
    );
  }
}
