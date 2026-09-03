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
import {
  foreignTradeHistorySchema,
  type ForeignTradeSeries,
} from '../schemas/foreign-trade-history.schema';
import { readSeed } from './seed.utils';

/**
 * Loads what Bolivia declared crossing its border, year by year.
 *
 * The observatory's external sector had one voice: the balance of payments as a
 * multilateral compiler estimates it. This is the customs record of the same
 * years, reported by Bolivia itself. Neither is the correction of the other —
 * they count different things on different bases — and holding both is what
 * lets a reader see how far apart they are instead of trusting whichever one
 * happened to be loaded.
 *
 * Every year is its own artifact because every year was its own request. The
 * artifact is keyed on the digest of the bytes that request returned, so a
 * reload reconciles against what is already stored rather than duplicating it.
 */

const AGENT_CODE = 'FOREIGN_TRADE_BACKFILL';

type TradePoint = ForeignTradeSeries['points'][number];

async function reconcilePointArtifact(
  series: ForeignTradeSeries,
  point: TradePoint,
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
      artifactType: 'JSON',
      originalUri: point.sourceUrl,
      storageUri: point.sourceUrl,
      mimeType: 'application/json',
      sha256: point.upstreamSha256,
      retrievedAt: new Date(point.retrievedAt),
      metadataJson: {
        publisher: series.publisher,
        indicatorCode: series.indicatorCode,
        compilerCode: series.compilerCode,
        indicatorName: series.name,
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
 * Payload for one year.
 *
 * `eventDate` closes the year rather than opening it, for the same reason as
 * every other annual figure here: a total for a year is only known once the
 * year is over, and a reader sorting by date should not meet it early.
 */
function annualPayload(series: ForeignTradeSeries, point: TradePoint): Record<string, unknown> {
  return {
    recordType: 'PERIOD_INDICATOR',
    dataCategory: 'FOREIGN_TRADE',
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
    compilerCode: series.compilerCode,
    publisher: series.publisher,
    publisherVerified: true,
    url: point.sourceUrl,
    sha256: point.upstreamSha256,
    storageUri: point.sourceUrl,
  };
}

async function reconcilePoint(
  series: ForeignTradeSeries,
  point: TradePoint,
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const payload = annualPayload(series, point);
  const payloadHash = rawPayloadHash(payload);
  const present = await RawObservationModel.findOne({
    attributes: ['rawObservationId'],
    where: { payloadHash },
    transaction,
  });
  if (present) return;

  // The same rule the ingestion path enforces: a figure absent from the record
  // kept as evidence is not a reading.
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

export async function reconcileForeignTrade(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const history = await readSeed('boot/foreign-trade.json', foreignTradeHistorySchema);
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  for (const series of history.series) {
    for (const point of series.points) {
      await reconcilePoint(series, point, sourceId, agentRunId, transaction);
    }
  }
}
