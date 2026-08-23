import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Sequelize, Transaction } from 'sequelize';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/actor';
import { assertActorOrganization } from '../../common/auth/organization-scope';
import { ApplicationError } from '../../common/errors/application.error';
import { MetricsService } from '../../common/observability/metrics.service';
import { APP_ATTRIBUTES } from '../../common/observability/telemetry.constants';
import { TracingService } from '../../common/observability/tracing.service';
import { withSerializableRetry } from '../../common/persistence.transaction';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { ClaimPersistenceService } from './claim-persistence.service';
import { rawPayloadHash } from '../../common/intelligence/claim-normalizer';
import { IntelligenceWriteRepository } from './intelligence-write.repository';
import type { SubmissionItemResult, SubmissionResult } from './intelligence-results';
import type { SubmissionItemInput, SubmitObservationsInput } from './intelligence.schemas';

@Injectable()
export class SubmissionService {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    private readonly repository: IntelligenceWriteRepository,
    private readonly claims: ClaimPersistenceService,
    private readonly metrics: MetricsService,
    private readonly audit: AuditService,
    private readonly tracing: TracingService,
  ) {}

  /**
   * Accepts a bounded batch from one agent run.
   *
   * Every item is stored raw before it is interpreted, and a failure in one
   * item is isolated with a savepoint so a single malformed record cannot
   * discard a day of collected intelligence.
   */
  async submit(
    agentRunId: string,
    input: SubmitObservationsInput,
    actor: Actor,
  ): Promise<SubmissionResult> {
    return this.tracing.runInSpan(
      'intelligence.submit-claims',
      {
        [APP_ATTRIBUTES.module]: 'intelligence',
        [APP_ATTRIBUTES.operation]: 'submit-claims',
        [APP_ATTRIBUTES.entityType]: 'agent-run',
        [APP_ATTRIBUTES.entityId]: agentRunId,
        [APP_ATTRIBUTES.batchSize]: input.items.length,
      },
      async () => this.persistSubmission(agentRunId, input, actor),
    );
  }

  private async persistSubmission(
    agentRunId: string,
    input: SubmitObservationsInput,
    actor: Actor,
  ): Promise<SubmissionResult> {
    const result = await withSerializableRetry(this.writer, async (transaction) => {
      const run = await this.repository.requireOpenRun(agentRunId, transaction);
      const agent = await this.repository.requireAgentById(run.aiAgentId, transaction);
      assertActorOrganization(
        actor,
        agent.organizationId,
        'Actor cannot submit for another organization',
      );
      await this.repository.assertArtifactsExist(
        input.items.flatMap((item) => item.claim.evidence.map((piece) => piece.sourceArtifactId)),
        transaction,
      );

      const items: SubmissionItemResult[] = [];
      for (const [index, item] of input.items.entries()) {
        items.push(await this.processItem(index, item, agentRunId, transaction));
      }

      const counts = tallyOutcomes(items);
      await run.update(
        {
          recordsReceived: String(Number(run.recordsReceived) + input.items.length),
          recordsAccepted: String(
            Number(run.recordsAccepted) + counts.publishedCount + counts.pendingReviewCount,
          ),
          recordsRejected: String(Number(run.recordsRejected) + counts.rejectedCount),
          recordsQuarantined: String(Number(run.recordsQuarantined) + counts.quarantinedCount),
        },
        { transaction },
      );
      await this.audit.recordInTransaction(
        {
          action: 'intelligence.submission.accepted',
          entityType: 'agent_run',
          entityReference: agentRunId,
          details: { submissionCode: input.submissionCode, ...counts },
        },
        transaction,
      );
      return {
        agentRunId,
        submissionCode: input.submissionCode,
        receivedCount: input.items.length,
        ...counts,
        items,
      } satisfies SubmissionResult;
    });

    for (const item of result.items) {
      this.metrics.observeIntelligence('raw', outcomeToMetric(item.outcome));
    }
    // Outcome counts are bounded integers, so they are safe to publish and let
    // an operator see a batch that was accepted but mostly quarantined.
    this.tracing.setAttributes({
      'app.submission.published': result.publishedCount,
      'app.submission.pending_review': result.pendingReviewCount,
      'app.submission.quarantined': result.quarantinedCount,
      'app.submission.rejected': result.rejectedCount,
    });
    return result;
  }

  private async processItem(
    index: number,
    item: SubmissionItemInput,
    agentRunId: string,
    parentTransaction: Transaction,
  ): Promise<SubmissionItemResult> {
    const savepoint = `intelligence_item_${index}`;
    await this.writer.query(`SAVEPOINT ${savepoint}`, { transaction: parentTransaction });
    try {
      const outcome = await this.persistItem(index, item, agentRunId, parentTransaction);
      await this.writer.query(`RELEASE SAVEPOINT ${savepoint}`, { transaction: parentTransaction });
      return outcome;
    } catch (error) {
      await this.writer.query(`ROLLBACK TO SAVEPOINT ${savepoint}`, {
        transaction: parentTransaction,
      });
      await this.writer.query(`RELEASE SAVEPOINT ${savepoint}`, { transaction: parentTransaction });
      if (!(error instanceof ApplicationError)) throw error;
      return {
        index,
        outcome: 'REJECTED',
        explanation: error.message,
      };
    }
  }

  private async persistItem(
    index: number,
    item: SubmissionItemInput,
    agentRunId: string,
    transaction: Transaction,
  ): Promise<SubmissionItemResult> {
    const payloadHash = rawPayloadHash(item.rawPayload);
    const { raw, created } = await this.repository.claimRawObservation(
      { agentRunId, payloadHash, payload: item.rawPayload },
      transaction,
    );
    if (!created) {
      return { index, outcome: 'DUPLICATE', rawObservationId: raw.rawObservationId };
    }
    return this.claims.persist(
      {
        index,
        item,
        agentRunId,
        rawObservationId: raw.rawObservationId,
        correlationId: randomUUID(),
      },
      transaction,
    );
  }
}

function tallyOutcomes(items: readonly SubmissionItemResult[]): {
  publishedCount: number;
  pendingReviewCount: number;
  quarantinedCount: number;
  duplicateCount: number;
  rejectedCount: number;
} {
  const count = (outcome: SubmissionItemResult['outcome']): number =>
    items.filter((item) => item.outcome === outcome).length;
  return {
    publishedCount: count('PUBLISHED'),
    pendingReviewCount: count('PENDING_REVIEW'),
    quarantinedCount: count('QUARANTINED'),
    duplicateCount: count('DUPLICATE'),
    rejectedCount: count('REJECTED'),
  };
}

function outcomeToMetric(
  outcome: SubmissionItemResult['outcome'],
): 'accepted' | 'duplicate' | 'quarantined' | 'rejected' {
  if (outcome === 'DUPLICATE') return 'duplicate';
  if (outcome === 'QUARANTINED') return 'quarantined';
  if (outcome === 'REJECTED') return 'rejected';
  return 'accepted';
}
