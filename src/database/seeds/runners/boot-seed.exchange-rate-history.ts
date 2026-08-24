import { createHash, randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import { ClaimEvidenceModel, FactClaimModel, RawObservationModel } from '../../models';
import { reconcileHistoryArtifact, reconcileHistoryRun } from './boot-seed.history-provenance';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import {
  INDICATOR_CODES,
  INDICATOR_UNITS,
  ungroundedMeasures,
  type IndicatorMeasure,
} from '../../../common/economic-indicators/indicator-codes';
import {
  exchangeRateHistorySchema,
  type ExchangeRateHistory,
  type ExchangeRatePoint,
} from '../schemas/exchange-rate-history.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the exchange rate series that predate the daily collector.
 *
 * The collector only knows what it has seen since it started running, so a
 * dashboard opened today would show lines beginning in August with no way to
 * read the year in which the official rate was realigned and the parallel one
 * met it. This backfills the rest from the publisher's own historical export,
 * versioned in the repository rather than requested at boot: a deployment must
 * not depend on a third-party endpoint being reachable, and a committed
 * snapshot is reviewable in a way a live fetch never is.
 *
 * It is not demonstration data. Every reading carries the same provenance a
 * collected one does and lands in the same governed tables, so the series a
 * chart draws is continuous and every point on it can be traced back.
 *
 * Idempotent by construction: each reading is keyed by the canonical hash of
 * its own payload, the same hash the ingestion path uses, so a second run finds
 * every row already present and writes nothing.
 */

interface HistorySeries {
  /** Seed file, relative to the seeds directory. */
  readonly file: string;
  /** Identity the series is written under. */
  readonly agentCode: string;
  readonly dataCategory: 'FX_PARALLEL' | 'FX_OFFICIAL';
  readonly indicatorCode: string;
  /** How the assertion names the series in prose. */
  readonly label: string;
}

const SERIES: readonly HistorySeries[] = [
  {
    file: 'boot/fx-parallel-history-2024.json',
    agentCode: 'FX_PARALLEL_HISTORY_BACKFILL',
    dataCategory: 'FX_PARALLEL',
    indicatorCode: INDICATOR_CODES.parallelExchangeRate,
    label: 'Dolar paralelo BOB/USD',
  },
  {
    file: 'boot/fx-official-history-2024.json',
    agentCode: 'FX_OFFICIAL_HISTORY_BACKFILL',
    dataCategory: 'FX_OFFICIAL',
    indicatorCode: INDICATOR_CODES.officialExchangeRate,
    label: 'Tipo de cambio oficial BOB/USD',
  },
  {
    file: 'boot/fx-parallel-history-2025.json',
    agentCode: 'FX_PARALLEL_HISTORY_BACKFILL',
    dataCategory: 'FX_PARALLEL',
    indicatorCode: INDICATOR_CODES.parallelExchangeRate,
    label: 'Dolar paralelo BOB/USD',
  },
  {
    file: 'boot/fx-official-history-2025.json',
    agentCode: 'FX_OFFICIAL_HISTORY_BACKFILL',
    dataCategory: 'FX_OFFICIAL',
    indicatorCode: INDICATOR_CODES.officialExchangeRate,
    label: 'Tipo de cambio oficial BOB/USD',
  },
  {
    file: 'boot/fx-parallel-history.json',
    agentCode: 'FX_PARALLEL_HISTORY_BACKFILL',
    dataCategory: 'FX_PARALLEL',
    indicatorCode: INDICATOR_CODES.parallelExchangeRate,
    label: 'Dolar paralelo BOB/USD',
  },
  {
    file: 'boot/fx-official-history.json',
    agentCode: 'FX_OFFICIAL_HISTORY_BACKFILL',
    dataCategory: 'FX_OFFICIAL',
    indicatorCode: INDICATOR_CODES.officialExchangeRate,
    label: 'Tipo de cambio oficial BOB/USD',
  },
];

function measuresFor(series: HistorySeries, point: ExchangeRatePoint): IndicatorMeasure[] {
  return [
    {
      indicatorCode: series.indicatorCode,
      priceSide: 'BUY',
      value: point.buy,
      unit: INDICATOR_UNITS.bolivianosPerDollar,
    },
    {
      indicatorCode: series.indicatorCode,
      priceSide: 'SELL',
      value: point.sell,
      unit: INDICATOR_UNITS.bolivianosPerDollar,
    },
  ];
}

/** Payload for one day, shaped exactly like the one the collector submits. */
function dailyPayload(
  series: HistorySeries,
  history: ExchangeRateHistory,
  point: ExchangeRatePoint,
): Record<string, unknown> {
  return {
    recordType: 'DAILY_INDICATOR',
    dataCategory: series.dataCategory,
    eventDate: point.date,
    aggregation: history.provenance.aggregation,
    measures: measuresFor(series, point),
    publisher: history.provenance.publisher,
    publisherVerified: true,
    url: history.provenance.sourceUrl,
    sha256: history.provenance.upstreamSha256,
    storageUri: history.provenance.sourceUrl,
  };
}

/**
 * The quotation retained as evidence.
 *
 * Where the snapshot captured the literal fragment it came from, that is what
 * is stored: it can be found again in the bytes the digest covers. Older
 * snapshots captured before that carry a restatement of the parsed values, and
 * are kept as they are rather than rewritten, because evidence is immutable.
 */
function evidenceExcerpt(point: ExchangeRatePoint): string {
  return point.excerpt ?? `${point.date} buy ${point.buy} sell ${point.sell}`;
}

async function reconcileSeries(
  series: HistorySeries,
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const history = await readSeed(series.file, exchangeRateHistorySchema);
  const sourceArtifactId = await reconcileHistoryArtifact(history, sourceId, transaction);
  const agentRunId = await reconcileHistoryRun(series.agentCode, transaction);

  const entries = history.points.map((point) => ({
    point,
    payload: dailyPayload(series, history, point),
  }));
  const hashes = entries.map((entry) => rawPayloadHash(entry.payload));

  // One query decides what is missing, so a boot with nothing to do costs a
  // single read instead of one per day of history.
  const present = new Set(
    (
      await RawObservationModel.findAll({
        attributes: ['payloadHash'],
        where: { payloadHash: { [Op.in]: hashes } },
        transaction,
      })
    ).map((row) => row.payloadHash),
  );

  for (const [index, entry] of entries.entries()) {
    const payloadHash = hashes[index];
    if (!payloadHash || present.has(payloadHash)) continue;

    const excerpt = evidenceExcerpt(entry.point);
    // The same rule the ingestion path enforces: a figure that is not in the
    // quotation retained as evidence is not a reading, it is a claim.
    const ungrounded = ungroundedMeasures(measuresFor(series, entry.point), excerpt);
    if (ungrounded.length) {
      throw new Error(
        `${series.file} ${entry.point.date}: figures absent from the cited excerpt: ${ungrounded.join(', ')}`,
      );
    }

    const observation = await RawObservationModel.create(
      {
        agentRunId,
        sourceArtifactId,
        payloadJson: entry.payload,
        payloadHash,
        receivedAt: new Date(history.provenance.retrievedAt),
        processingStatus: 'NORMALIZED',
        retryCount: 0,
      },
      { transaction },
    );

    const assertion = `${series.label} promedio del ${entry.point.date}: buy (compra) ${entry.point.buy} y sell (venta) ${entry.point.sell}.`;
    const factClaimId = randomUUID();
    await FactClaimModel.create(
      {
        factClaimId,
        agentRunId,
        rawObservationId: observation.rawObservationId,
        claimType: 'INDICATOR_READING',
        assertion,
        eventDate: entry.point.date,
        confidenceLevel: 'HIGH',
        confidenceScore: '0.8500',
        impactLevel: 'HIGH',
        timeHorizon: 'IMMEDIATE',
        status: 'PUBLISHED',
        contentHash: claimContentHash({
          claimType: 'INDICATOR_READING',
          assertion,
          eventDate: entry.point.date,
        }),
        createdAt: new Date(),
      },
      { transaction },
    );

    await ClaimEvidenceModel.create(
      {
        factClaimId,
        sourceArtifactId,
        excerpt,
        excerptHash: createHash('sha256').update(excerpt).digest('hex'),
        locator: history.provenance.sourceUrl,
        retrievedAt: new Date(history.provenance.retrievedAt),
      },
      { transaction },
    );
  }
}

export async function reconcileExchangeRateHistory(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  for (const series of SERIES) await reconcileSeries(series, sourceId, transaction);
}
