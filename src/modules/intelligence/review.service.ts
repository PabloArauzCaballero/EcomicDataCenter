import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Sequelize } from 'sequelize';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/actor';
import { BusinessRuleError } from '../../common/errors/application.error';
import { MetricsService } from '../../common/observability/metrics.service';
import { withSerializableRetry } from '../../common/persistence.transaction';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { AiAgentModel } from '../../database/models';
import { IntelligenceWriteRepository } from './intelligence-write.repository';
import type {
  CompleteAgentRunInput,
  ResolveContradictionInput,
  ReviewDecisionInput,
} from './intelligence.schemas';

const CLAIM_STATUS_BY_DECISION: Readonly<Record<string, string>> = {
  APPROVED: 'PUBLISHED',
  REJECTED: 'REJECTED',
};

@Injectable()
export class ReviewService {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    private readonly repository: IntelligenceWriteRepository,
    private readonly metrics: MetricsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Applies a human decision to a pending claim.
   *
   * The reviewer identity and rationale are mandatory: an approval without a
   * recorded justification is indistinguishable from an automated publication,
   * which is exactly what the review step exists to prevent.
   */
  decide(
    reviewTaskId: string,
    input: ReviewDecisionInput,
    actor: Actor,
  ): Promise<{ reviewTaskId: string; status: string; claimStatus: string | null }> {
    return withSerializableRetry(this.writer, async (transaction) => {
      const task = await this.repository.requireReviewTask(reviewTaskId, transaction);
      if (task.status !== 'PENDING' && task.status !== 'IN_REVIEW') {
        throw new BusinessRuleError('The review task is already resolved', {
          reviewTaskId,
          status: task.status,
        });
      }

      const resolvedAt = input.decision === 'ESCALATED' ? null : new Date();
      await task.update(
        {
          status: input.decision,
          decidedBy: input.decision === 'ESCALATED' ? null : actor.subject,
          decisionRationale: input.decision === 'ESCALATED' ? null : input.rationale,
          resolvedAt,
        },
        { transaction },
      );

      const claimStatus = CLAIM_STATUS_BY_DECISION[input.decision];
      if (task.targetType === 'FACT_CLAIM' && claimStatus) {
        const claim = await this.repository.requireClaim(task.targetReference, transaction);
        await claim.update({ status: claimStatus }, { transaction });
      }
      await this.audit.recordInTransaction(
        {
          action: 'intelligence.review.decided',
          entityType: 'review_task',
          entityReference: reviewTaskId,
          details: {
            decision: input.decision,
            targetType: task.targetType,
            targetReference: task.targetReference,
          },
        },
        transaction,
      );
      this.metrics.observeIntelligence('review', 'resolved');
      return { reviewTaskId, status: input.decision, claimStatus: claimStatus ?? null };
    });
  }

  /** Closes a contradiction with an explicit, attributable justification. */
  resolveContradiction(
    dataContradictionId: string,
    input: ResolveContradictionInput,
    actor: Actor,
  ): Promise<{ dataContradictionId: string; status: string }> {
    return withSerializableRetry(this.writer, async (transaction) => {
      const contradiction = await this.repository.requireContradiction(
        dataContradictionId,
        transaction,
      );
      if (contradiction.status !== 'OPEN' && contradiction.status !== 'UNDER_REVIEW') {
        throw new BusinessRuleError('The contradiction is already closed', {
          dataContradictionId,
          status: contradiction.status,
        });
      }
      await contradiction.update(
        {
          status: input.resolution,
          resolvedAt: new Date(),
          resolutionRationale: `${actor.subject}: ${input.rationale}`,
          selectedReference: input.selectedReference ?? null,
        },
        { transaction },
      );
      await this.audit.recordInTransaction(
        {
          action: 'intelligence.contradiction.resolved',
          entityType: 'data_contradiction',
          entityReference: dataContradictionId,
          details: { resolution: input.resolution, selectedReference: input.selectedReference },
        },
        transaction,
      );
      this.metrics.observeIntelligence('contradiction', 'resolved');
      return { dataContradictionId, status: input.resolution };
    });
  }

  /** Closes an agent run and stores the checkpoint needed to resume it. */
  completeRun(
    agentRunId: string,
    input: CompleteAgentRunInput,
    actor: Actor,
  ): Promise<{ agentRunId: string; status: string }> {
    return withSerializableRetry(this.writer, async (transaction) => {
      const run = await this.repository.requireOpenRun(agentRunId, transaction);
      // A run identifier is not a capability: without this check any agent that
      // learns another organization's run id could close it and overwrite its
      // checkpoint, corrupting a foreign run's resumability and audit trail.
      const agent = await AiAgentModel.findByPk(run.aiAgentId, { transaction });
      if (actor.organizationId && agent && actor.organizationId !== agent.organizationId) {
        throw new ForbiddenException('Actor cannot complete a run of another organization');
      }
      await run.update(
        {
          status: input.status,
          completedAt: new Date(),
          sourcesConsulted: input.sourcesConsulted,
          warningCount: input.warningCount,
          estimatedCostUsd:
            input.estimatedCostUsd === undefined ? null : String(input.estimatedCostUsd),
          errorSummary: input.errorSummary ?? null,
          checkpointJson: input.checkpoint ?? null,
        },
        { transaction },
      );
      await this.audit.recordInTransaction(
        {
          action: 'intelligence.agent-run.completed',
          entityType: 'agent_run',
          entityReference: agentRunId,
          details: { status: input.status, warningCount: input.warningCount },
        },
        transaction,
      );
      return { agentRunId, status: input.status };
    });
  }
}
