import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { AgentRunModel, AiAgentModel, SourceArtifactModel } from '../../models';
import type { ExchangeRateHistory } from '../schemas/exchange-rate-history.schema';

/**
 * The provenance a backfilled series hangs from.
 *
 * Kept apart from the loading loop because these two rows are the part an
 * auditor reads first: which artifact the figures came from, and under whose
 * identity they were written.
 */

/**
 * The whole export is one artifact, and every day cites a slice of it.
 *
 * The digest is of the payload the points were read from, not of anything
 * reconstructed, so re-requesting the same closed range reproduces it.
 */
export async function reconcileHistoryArtifact(
  history: ExchangeRateHistory,
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
        ...(history.provenance.originator ? { originator: history.provenance.originator } : {}),
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

/** One run stands for a whole backfill, so re-running never opens another. */
export async function reconcileHistoryRun(
  agentCode: string,
  transaction: Transaction,
): Promise<string> {
  const agent = await AiAgentModel.findOne({ where: { code: agentCode }, transaction });
  if (!agent) throw new Error(`exchange rate history seed requires the ${agentCode} agent`);

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
      correlationId: `exchange-rate-history-${agentRunId}`,
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
