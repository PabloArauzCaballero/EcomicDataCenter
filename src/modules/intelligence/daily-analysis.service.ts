import { Injectable } from '@nestjs/common';
import type { Actor } from '../../common/auth/actor';
import { AgentRegistryService } from './agent-registry.service';
import type { DailyAnalysisResult } from './intelligence-results';
import type { SubmitDailyAnalysisInput } from './intelligence.schemas';
import { ReviewService } from './review.service';
import { SubmissionService } from './submission.service';

@Injectable()
export class DailyAnalysisService {
  constructor(
    private readonly agents: AgentRegistryService,
    private readonly submissions: SubmissionService,
    private readonly reviews: ReviewService,
  ) {}

  /**
   * Runs a full daily collection cycle for one agent in a single request.
   *
   * It opens the run, stores the day's batch of claims and closes the run,
   * composing the three hardened intelligence services so an agent like codex
   * does not need three round trips. Each step keeps its own serializable
   * transaction and organization check; nothing is written to the statistical
   * core, so the untrusted-agent boundary is preserved.
   */
  async run(
    input: SubmitDailyAnalysisInput,
    actor: Actor,
    correlationId: string,
  ): Promise<DailyAnalysisResult> {
    const run = await this.agents.open(input.agent, actor, correlationId);
    try {
      const submission = await this.submissions.submit(run.agentRunId, input.submission, actor);
      const completion = await this.reviews.completeRun(run.agentRunId, input.completion, actor);
      return {
        agentRunId: run.agentRunId,
        agentCode: run.agentCode,
        correlationId,
        submission,
        completion: { status: completion.status },
      };
    } catch (error) {
      // A cycle that aborts after opening the run would otherwise leave it stuck
      // in RUNNING. Close it as FAILED on a best-effort basis so the run does not
      // dangle, then surface the original error unchanged.
      await this.closeFailedRun(run.agentRunId, actor);
      throw error;
    }
  }

  private async closeFailedRun(agentRunId: string, actor: Actor): Promise<void> {
    // Swallow a failure here on purpose: if the run cannot be closed it stays
    // open for the sweep to reconcile, and the first error must never be masked.
    await this.reviews
      .completeRun(
        agentRunId,
        {
          status: 'FAILED',
          sourcesConsulted: 0,
          warningCount: 0,
          errorSummary: 'Daily analysis aborted before completion',
        },
        actor,
      )
      .catch(() => undefined);
  }
}
