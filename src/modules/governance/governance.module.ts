import { Module } from '@nestjs/common';
import { DatasetService } from './dataset.service';
import { GovernanceController } from './governance.controller';
import { MetadataCatalogService } from './metadata-catalog.service';
import { MetadataService } from './metadata.service';
import { MethodologyService } from './methodology.service';
import { SemanticService } from './semantic.service';

@Module({
  controllers: [GovernanceController],
  providers: [
    DatasetService,
    MetadataCatalogService,
    MetadataService,
    MethodologyService,
    SemanticService,
  ],
})
export class GovernanceModule {}
