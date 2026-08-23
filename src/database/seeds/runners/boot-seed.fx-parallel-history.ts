import { createHash, randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import {
  AgentRunModel,
  AiAgentModel,
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import {
  INDICATOR_CODES,
  INDICATOR_UNITS,
} from '../../../common/economic-indicators/indicator-codes';
import {
  fxParallelHistorySchema,
  type FxParallelHistory,
} from '../schemas/fx-parallel-history.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the parallel exchange rate series that predates the daily collector.
 *
 * The collector only knows what it has seen since it started running, so a
 * dashboard opened today would show a line beginning in August with no way to
 * read the year. This backfills the rest from the publisher's own historical
 * export, which is versioned in the repository rather than requested at boot:
 * a deployment must not depend on a third-party endpoint being reachable, and a
 * committed snapshot is reviewable in a way a live fetch never is.
 *
 * It is not demonstration data. Every reading carries the same provenance a
 * collected one does — publisher, source URL, digest of the exact payload it
 * came from — and lands in the same governed tables, so the series a chart
 * draws is continuous and every point on it can be traced back.
 *
 * Idempotent by construction: each reading is keyed by the canonical hash of
 * its own payload, the same hash the ingestion path uses, so a second run finds
 * every row already present and writes nothing.
 */

/** Identity the backfill writes under, kept separate from the daily collector. */
const backfillAgentCode = 'FX_PARALLEL_HISTORY_BACKFILL';

/**
 * The whole export is one artifact, and every day cites a slice of it.
 *
 * This mirrors how the collector works: the excerpt a claim quotes has to be
 * present in the bytes that were hashed and retained, so the digest here is of
 * the payload the points were read from, not of anything reconstructed.
 */
async function reconcileArtifact(
  history: FxParallelHistory,
  sourceId: string,
  transaction: Transaction,
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: history.provenance.upstreamSha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'JSON',
      originalUri: history.provenance.sourceUrl,
      storageUri: history.provenance.sourceUrl,
      mimeType: 'application/json',
      sha256: history.provenance.upstreamSha256,
      retrievedAt: new Date(history.provenance.retrievedAt),
      metadataJson: {
        publisher: history.provenance.publisher,
        aggregation: history.provenance.aggregation,
        rangeStart: history.provenance.rangeStart,
        rangeEnd: history.provenance.rangeEnd,
        pointCount: history.points.length,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

/** One run stands for the whole backfill, so re-running never opens another. */
async function reconcileRun(transaction: Transaction): Promise<string> {
  const agent = await AiAgentModel.findOne({ where: { code: backfillAgentCode }, transaction });
  if (!agent) throw new Error(`fx-parallel-history seed requires the ${backfillAgentCode} agent`);

  const existing = await AgentRunModel.findOne({
    where: { aiAgentId: agent.aiAgentId, triggerType: 'BACKFILL' },
    order: [['startedAt', 'ASC']],
    transaction,
  });
  if (existing) return existing.agentRunId;

  const agentRunId = randomUUID();
  await AgentRunModel.create(
    {
      agentRunId,
      aiAgentId: agent.aiAgentId,
      correlationId: `fx-parallel-history-${agentRunId}`,
      triggerType: 'BACKFILL',
      attemptNo: 1,
      status: 'SUCCEEDED',
      startedAt: new Date(),
      completedAt: new Date(),
      sourcesConsulted: 1,
      recordsReceived: '0',
      recordsAccepted: '0',
      recordsRejected: '0',
      recordsQuarantined: '0',
      warningCount: 0,
      promptVersion: 'n/a',
      schemaVersion: '1.0.0',
    },
    { transaction },
  );
  return agentRunId;
}

/** Payload for one day, shaped exactly like the one the collector submits. */
function dailyPayload(
  history: FxParallelHistory,
  point: FxParallelHistory['points'][number],
): Record<string, unknown> {
  return {
    recordType: 'DAILY_INDICATOR',
    dataCategory: 'FX_PARALLEL',
    eventDate: point.date,
    aggregation: history.provenance.aggregation,
    measures: [
      {
        indicatorCode: INDICATOR_CODES.parallelExchangeRate,
        priceSide: 'BUY',
        value: point.buy,
        unit: INDICATOR_UNITS.bolivianosPerDollar,
      },
      {
        indicatorCode: INDICATOR_CODES.parallelExchangeRate,
        priceSide: 'SELL',
        value: point.sell,
        unit: INDICATOR_UNITS.bolivianosPerDollar,
      },
    ],
    publisher: history.provenance.publisher,
    publisherVerified: true,
    url: history.provenance.sourceUrl,
    sha256: history.provenance.upstreamSha256,
    storageUri: history.provenance.sourceUrl,
  };
}

/** Wording that states both prices, quoting the values the snapshot holds. */
function dailyAssertion(point: FxParallelHistory['points'][number]): string {
  return `Dolar paralelo BOB/USD promedio del ${point.date}: buy (compra) ${point.buy} y sell (venta) ${point.sell}.`;
}

export async function reconcileFxParallelHistory(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const history = await readSeed('boot/fx-parallel-history.json', fxParallelHistorySchema);
  const sourceArtifactId = await reconcileArtifact(history, sourceId, transaction);
  const agentRunId = await reconcileRun(transaction);

  const payloads = history.points.map((point) => ({
    point,
    payload: dailyPayload(history, point),
  }));
  const hashes = payloads.map((entry) => rawPayloadHash(entry.payload));

  // One query decides what is missing, so a boot that has nothing to do costs a
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

  for (const [index, entry] of payloads.entries()) {
    const payloadHash = hashes[index];
    if (!payloadHash || present.has(payloadHash)) continue;

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

    const assertion = dailyAssertion(entry.point);
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
        excerpt: `${entry.point.date} buy ${entry.point.buy} sell ${entry.point.sell}`,
        excerptHash: createHash('sha256')
          .update(`${entry.point.date}|${entry.point.buy}|${entry.point.sell}`)
          .digest('hex'),
        locator: history.provenance.sourceUrl,
        retrievedAt: new Date(history.provenance.retrievedAt),
      },
      { transaction },
    );
  }
}
