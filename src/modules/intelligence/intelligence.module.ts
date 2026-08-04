import { Module } from '@nestjs/common';
import { AgentRegistryService } from './agent-registry.service';
import { AgentRunQueryRepository } from './agent-run-query.repository';
import { ClaimPersistenceService } from './claim-persistence.service';
import { ClaimQueryRepository } from './claim-query.repository';
import { ClaimQueryService } from './claim-query.service';
import { ClaimReviewController } from './claim-review.controller';
import { ClaimTriageService } from './claim-triage.service';
import { DailyAnalysisService } from './daily-analysis.service';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceWriteRepository } from './intelligence-write.repository';
import { ReprocessingService } from './reprocessing.service';
import { ReviewService } from './review.service';
import { SubmissionService } from './submission.service';

/**
 * Receives, validates and curates intelligence produced by autonomous agents.
 *
 * The module owns the untrusted boundary: nothing an agent sends reaches the
 * statistical core directly, and every published claim carries its evidence,
 * its producing model and, when required, a human decision.
 */
@Module({
  controllers: [IntelligenceController, ClaimReviewController],
  providers: [
    AgentRegistryService,
    AgentRunQueryRepository,
    ClaimPersistenceService,
    ClaimQueryRepository,
    ClaimQueryService,
    ClaimTriageService,
    DailyAnalysisService,
    IntelligenceWriteRepository,
    ReprocessingService,
    ReviewService,
    SubmissionService,
  ],
})
export class IntelligenceModule {}
