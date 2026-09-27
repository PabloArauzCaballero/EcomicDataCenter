import { Module } from '@nestjs/common';
import { QualityController } from './quality.controller';
import { QualityEvaluationRepository } from './quality-evaluation.repository';
import { QualityEvaluationService } from './quality-evaluation.service';
import { QualityService } from './quality.service';

@Module({
  controllers: [QualityController],
  providers: [QualityService, QualityEvaluationService, QualityEvaluationRepository],
})
export class QualityModule {}
