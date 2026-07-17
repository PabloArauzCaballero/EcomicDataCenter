import { Injectable } from '@nestjs/common';
import type {
  CreateDataStructureInput,
  CreateDatasetInput,
  CreateIndicatorInput,
  CreateMethodologyInput,
  CreateStatisticalOperationInput,
  DatasetVersionInput,
  MethodologyVersionInput,
} from './metadata.schemas';
import { DatasetService } from './dataset.service';
import { MetadataCatalogService } from './metadata-catalog.service';
import { MethodologyService } from './methodology.service';

/** Thin facade kept as the stable entry point for governance controllers. */
@Injectable()
export class MetadataService {
  constructor(
    private readonly catalog: MetadataCatalogService,
    private readonly methodologies: MethodologyService,
    private readonly datasets: DatasetService,
  ) {}

  createStatisticalOperation(input: CreateStatisticalOperationInput) {
    return this.catalog.createStatisticalOperation(input);
  }

  createMethodology(input: CreateMethodologyInput) {
    return this.methodologies.create(input);
  }

  createMethodologyVersion(methodologyId: string, input: MethodologyVersionInput) {
    return this.methodologies.createVersion(methodologyId, input);
  }

  createDataStructure(input: CreateDataStructureInput) {
    return this.catalog.createDataStructure(input);
  }

  createDataset(input: CreateDatasetInput) {
    return this.datasets.create(input);
  }

  createDatasetVersion(datasetId: string, input: DatasetVersionInput) {
    return this.datasets.createVersion(datasetId, input);
  }

  createIndicator(input: CreateIndicatorInput) {
    return this.catalog.createIndicator(input);
  }

  transitionMethodologyVersion(id: string, targetStatus: string) {
    return this.methodologies.transition(id, targetStatus);
  }

  transitionDatasetVersion(id: string, targetStatus: string) {
    return this.datasets.transition(id, targetStatus);
  }
}
