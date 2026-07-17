import { Module } from '@nestjs/common';
import { BatchImportService } from './batch-import.service';
import { IngestionController } from './ingestion.controller';
import { ObservationRegistrationService } from './observation-registration.service';
import { ObservationWriteRepository } from './observation-write.repository';
import { RevisionWriteRepository } from './revision-write.repository';
import { QualityEvaluatorService } from './quality-evaluator.service';
import { StructureRepository } from './structure.repository';

@Module({
  controllers: [IngestionController],
  providers: [
    BatchImportService,
    ObservationRegistrationService,
    ObservationWriteRepository,
    RevisionWriteRepository,
    QualityEvaluatorService,
    StructureRepository,
  ],
})
export class IngestionModule {}
