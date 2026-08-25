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
import { marketPricesSchema, type MarketSeries } from '../schemas/market-prices.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the daily closes of the markets that bear on the Bolivian dollar.
 *
 * These land in the same reading tables as every other daily series, keyed by
 * their own indicator codes, so they inherit the provenance and the
 * immutability the rest of the observatory has. They do not reach the
 * macroeconomic model, which admits only annual frequency, nor the exchange-rate
 * models, which select by the two Bolivian codes.
 *
 * Idempotent by construction: each close is keyed by the canonical hash of its
 * own payload, the same hash the ingestion path uses.
 */

const AGENT_CODE = 'MARKET_PRICES';

async function reconcileArtifact(
  series: MarketSeries,
  sourceId: string,
  transaction: Transaction,
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: series.provenance.upstreamSha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'JSON',
      originalUri: series.provenance.sourceUrl,
      storageUri: series.provenance.sourceUrl,
      mimeType: 'application/json',
      sha256: series.provenance.upstreamSha256,
      publicationDate: series.points.at(-1)?.date ?? null,
      retrievedAt: new Date(series.provenance.retrievedAt),
      metadataJson: {
        publisher: series.provenance.publisher,
        indicatorCode: series.indicatorCode,
        instrument: series.name,
        note: series.note,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

/**
 * Payload for one close, shaped exactly like the one the collector submits.
 *
 * The upstream digest is deliberately absent, for the same reason it is absent
 * from a press article: it identifies the response a close arrived in, not the
 * close, and the exchange serves a new response every day. Including it made a
 * re-collection of the same 2024 candle hash differently and land as a second
 * record. The digest is on the artifact, which is where a reader checks it.
 */
function dailyPayload(series: MarketSeries, date: string, close: string): Record<string, unknown> {
  return {
    recordType: 'DAILY_INDICATOR',
    dataCategory: 'MARKET_PRICE',
    eventDate: date,
    aggregation: 'DAILY_CLOSE',
    measures: [
      {
        indicatorCode: series.indicatorCode,
        indicatorName: series.name,
        value: close,
        unit: series.unit,
      },
    ],
    instrument: series.name,
    venue: series.provenance.publisher,
    publisher: series.provenance.publisher,
    publisherVerified: true,
    url: series.provenance.sourceUrl,
    storageUri: series.provenance.sourceUrl,
  };
}

async function reconcileSeries(
  series: MarketSeries,
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const sourceArtifactId = await reconcileArtifact(series, sourceId, transaction);
  const entries = series.points.map((point) => ({
    point,
    payload: dailyPayload(series, point.date, point.close),
  }));
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

  for (const [index, entry] of entries.entries()) {
    const payloadHash = hashes[index];
    if (!payloadHash || present.has(payloadHash)) continue;

    const observation = await RawObservationModel.create(
      {
        agentRunId,
        sourceArtifactId,
        payloadJson: entry.payload,
        payloadHash,
        receivedAt: new Date(series.provenance.retrievedAt),
        processingStatus: 'NORMALIZED',
        retryCount: 0,
      },
      { transaction },
    );

    const assertion = `${series.name} cerró en ${entry.point.close} ${series.unit} el ${entry.point.date}.`;
    const factClaimId = randomUUID();
    await FactClaimModel.create(
      {
        factClaimId,
        agentRunId,
        rawObservationId: observation.rawObservationId,
        claimType: 'INDICATOR_READING',
        assertion,
        eventDate: entry.point.date,
        publishedAt: new Date(`${entry.point.date}T23:59:59Z`),
        confidenceLevel: 'HIGH',
        confidenceScore: '0.9000',
        impactLevel: 'MEDIUM',
        timeHorizon: 'SHORT_TERM',
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
        excerpt: entry.point.excerpt,
        excerptHash: createHash('sha256').update(entry.point.excerpt).digest('hex'),
        locator: series.provenance.sourceUrl,
        retrievedAt: new Date(series.provenance.retrievedAt),
      },
      { transaction },
    );
  }
}

export async function reconcileMarketPrices(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const prices = await readSeed('boot/market-prices.json', marketPricesSchema);
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  for (const series of prices.series) {
    await reconcileSeries(series, sourceId, agentRunId, transaction);
  }
}
