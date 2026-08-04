import { Inject, Injectable } from '@nestjs/common';
import { Op, type Sequelize } from 'sequelize';
import { AuditService } from '../../common/audit/audit.service';
import { BusinessRuleError, NotFoundError } from '../../common/errors/application.error';
import { MetricsService } from '../../common/observability/metrics.service';
import { APP_ATTRIBUTES } from '../../common/observability/telemetry.constants';
import { TracingService } from '../../common/observability/tracing.service';
import { withSerializableRetry } from '../../common/persistence.transaction';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { RawObservationModel } from '../../database/models';
import type { DeadLetterItem, ReprocessResult } from './intelligence-results';
import { decideRetry, isRetryable, MAX_RETRY_ATTEMPTS } from './retry.policy';

const DEAD_LETTER_PAGE_SIZE = 100;

@Injectable()
export class ReprocessingService {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    private readonly metrics: MetricsService,
    private readonly audit: AuditService,
    private readonly tracing: TracingService,
  ) {}

  /**
   * Returns items that exhausted their attempts and now need a person.
   *
   * This is the dead-letter view. It is a query over durable state rather than
   * a separate broker, which keeps the operational surface to one database and
   * respects the deferred-queue decision recorded in ADR 0003.
   *
   * It stays on the writer pool despite being a read: migration 0025 isolates
   * `raw_observation` from the reader and 0029 re-grants only
   * `(processing_status, received_at)` for the metrics collector, so the
   * untrusted payload columns this view needs are unreachable from the reader
   * by design. Routing it there would fail with "permission denied".
   */
  async deadLetters(agentRunId?: string): Promise<readonly DeadLetterItem[]> {
    const rows = await RawObservationModel.findAll({
      where: {
        processingStatus: 'DEAD_LETTER',
        ...(agentRunId ? { agentRunId } : {}),
      },
      order: [['deadLetteredAt', 'DESC']],
      limit: DEAD_LETTER_PAGE_SIZE,
    });
    return rows.map((row) => ({
      rawObservationId: row.rawObservationId,
      agentRunId: row.agentRunId,
      payloadHash: row.payloadHash,
      retryCount: row.retryCount,
      lastError: row.lastError,
      deadLetteredAt: row.deadLetteredAt,
    }));
  }

  /**
   * Requeues one rejected or quarantined item for another attempt.
   *
   * The raw payload is never rewritten; only the processing status and the
   * attempt counter move, so reprocessing can never alter what the agent
   * originally submitted.
   */
  reprocess(rawObservationId: string): Promise<ReprocessResult> {
    return this.tracing.runInSpan(
      'intelligence.reprocess-observation',
      {
        [APP_ATTRIBUTES.module]: 'intelligence',
        [APP_ATTRIBUTES.operation]: 'reprocess-observation',
        [APP_ATTRIBUTES.entityType]: 'raw-observation',
        [APP_ATTRIBUTES.entityId]: rawObservationId,
      },
      () => this.requeueObservation(rawObservationId),
    );
  }

  private async requeueObservation(rawObservationId: string): Promise<ReprocessResult> {
    const result = await withSerializableRetry(this.writer, async (transaction) => {
      const row = await RawObservationModel.findByPk(rawObservationId, { transaction });
      if (!row) throw new NotFoundError('raw_observation', rawObservationId);
      if (!isRetryable(row.processingStatus)) {
        throw new BusinessRuleError('Only rejected or quarantined items can be reprocessed', {
          rawObservationId,
          processingStatus: row.processingStatus,
        });
      }

      const decision = decideRetry(row.retryCount);
      if (decision.action === 'DEAD_LETTER') {
        await row.update(
          {
            processingStatus: 'DEAD_LETTER',
            deadLetteredAt: new Date(),
            lastError: decision.reason,
          },
          { transaction },
        );
        await this.audit.recordInTransaction(
          {
            action: 'intelligence.raw-observation.dead-lettered',
            entityType: 'raw_observation',
            entityReference: rawObservationId,
            details: { attempt: decision.attempt, reason: decision.reason },
          },
          transaction,
        );
        return {
          rawObservationId,
          outcome: 'DEAD_LETTER',
          retryCount: row.retryCount,
          explanation: decision.reason,
        } satisfies ReprocessResult;
      }

      await row.update(
        { processingStatus: 'RECEIVED', retryCount: decision.attempt, lastError: null },
        { transaction },
      );
      await this.audit.recordInTransaction(
        {
          action: 'intelligence.raw-observation.requeued',
          entityType: 'raw_observation',
          entityReference: rawObservationId,
          details: { attempt: decision.attempt, delaySeconds: decision.delaySeconds },
        },
        transaction,
      );
      return {
        rawObservationId,
        outcome: 'REQUEUED',
        retryCount: decision.attempt,
        nextAttemptDelaySeconds: decision.delaySeconds,
      } satisfies ReprocessResult;
    });
    // Counted after the commit: the callback is replayed on a serialization
    // conflict, so counting inside it inflates the metric once per attempt and
    // records outcomes that a rollback discarded.
    if (result.outcome === 'DEAD_LETTER') this.metrics.observeIntelligence('raw', 'rejected');
    return result;
  }

  /**
   * Moves stale in-flight items to the dead-letter state after a restart.
   *
   * A process that dies mid-submission leaves rows in `RECEIVED` that nothing
   * will ever advance. Sweeping them makes the loss visible instead of letting
   * an agent run appear complete while some of its data was never normalized.
   */
  async sweepAbandoned(olderThanMinutes: number): Promise<{ sweptCount: number }> {
    const threshold = new Date(Date.now() - olderThanMinutes * 60_000);
    const result = await withSerializableRetry(this.writer, async (transaction) => {
      const [sweptCount] = await RawObservationModel.update(
        {
          processingStatus: 'DEAD_LETTER',
          deadLetteredAt: new Date(),
          lastError: `Abandoned in RECEIVED for more than ${olderThanMinutes} minutes`,
        },
        {
          where: {
            processingStatus: 'RECEIVED',
            receivedAt: { [Op.lt]: threshold },
            retryCount: { [Op.lte]: MAX_RETRY_ATTEMPTS },
          },
          transaction,
        },
      );
      if (sweptCount > 0) {
        await this.audit.recordInTransaction(
          {
            action: 'intelligence.raw-observation.swept',
            entityType: 'raw_observation',
            details: { sweptCount, olderThanMinutes },
          },
          transaction,
        );
      }
      return { sweptCount };
    });
    if (result.sweptCount > 0) {
      this.metrics.observeIntelligence('raw', 'rejected', result.sweptCount);
    }
    return result;
  }
}
