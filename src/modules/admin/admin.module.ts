import { Module } from '@nestjs/common';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminIngestionController } from './admin-ingestion.controller';
import { AdminOverviewService } from './admin-overview.service';
import { AdminQualityController } from './admin-quality.controller';
import { AdminSeedsController } from './admin-seeds.controller';
import { AdminController } from './admin.controller';
import { AnalyticsIntakeRepository } from './analytics-intake.repository';
import { AnalyticsViewRepository } from './analytics-view.repository';
import { AuditViewRepository } from './audit-view.repository';
import { DeploymentIdentity } from './deployment-identity';
import { ExternalCheckScheduler } from './external-check.scheduler';
import { HealthProbeRepository } from './health-probe.repository';
import { HealthViewRepository } from './health-view.repository';
import { IngestionStatusRepository } from './ingestion-status.repository';
import { IngestionStatusService } from './ingestion-status.service';
import { MetadataViewRepository } from './metadata-view.repository';
import { OverviewRepository } from './overview.repository';
import { PublicationStateRepository } from './publication-state.repository';
import { QualityViewRepository } from './quality-view.repository';
import { SeedContextProvider } from './seed-context.provider';
import { SeedDifferenceRepository } from './seed-difference.repository';
import { SeedExecutionService } from './seed-execution.service';
import { SeedInspectionService } from './seed-inspection.service';
import { SeedLedgerRepository } from './seed-ledger.repository';
import { SeedRunRepository } from './seed-run.repository';
import { SeedPublicationService } from './seed-publication.service';
import { SiteAvailabilityService } from './site-availability.service';

/**
 * The administrative surface: read the operation, and act on the seeds.
 *
 * It imports nothing from another module. Everything it needs about ingestion,
 * quality or metadata it reads from the database those modules own, through the
 * reader pool, and everything it changes it changes through the seed path it
 * owns itself. That boundary is enforced by the architecture gate, and it is
 * also what stops this from becoming a second implementation of ingestion
 * wearing an administrator's badge.
 */
@Module({
  controllers: [
    AdminController,
    AdminIngestionController,
    AdminSeedsController,
    AdminQualityController,
    AdminAnalyticsController,
  ],
  providers: [
    DeploymentIdentity,
    AdminOverviewService,
    OverviewRepository,
    IngestionStatusService,
    IngestionStatusRepository,
    QualityViewRepository,
    MetadataViewRepository,
    AuditViewRepository,
    HealthViewRepository,
    HealthProbeRepository,
    SiteAvailabilityService,
    ExternalCheckScheduler,
    AnalyticsViewRepository,
    AnalyticsIntakeRepository,
    PublicationStateRepository,
    SeedContextProvider,
    SeedLedgerRepository,
    SeedRunRepository,
    SeedDifferenceRepository,
    SeedInspectionService,
    SeedExecutionService,
    SeedPublicationService,
  ],
})
export class AdminModule {}
