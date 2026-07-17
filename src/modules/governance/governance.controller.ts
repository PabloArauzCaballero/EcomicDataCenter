import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACTOR_ROLES } from '../../common/auth/actor';
import { Roles } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import {
  createDataStructureSchema,
  createDatasetSchema,
  createDatasetVersionSchema,
  createIndicatorSchema,
  createMethodologySchema,
  createMethodologyVersionSchema,
  createStatisticalOperationSchema,
  uuidParamsSchema,
  versionTransitionSchema,
  type CreateDataStructureInput,
  type CreateDatasetInput,
  type DatasetVersionInput,
  type CreateIndicatorInput,
  type CreateMethodologyInput,
  type MethodologyVersionInput,
  type CreateStatisticalOperationInput,
} from './metadata.schemas';
import { MetadataService } from './metadata.service';
import {
  createClassificationMappingSchema,
  createClassificationSchema,
  createCodeListSchema,
  createConceptSchema,
  createDomainSchema,
  createFrequencySchema,
  createGeographicUnitSchema,
  createUnitMeasureSchema,
  type CreateClassificationInput,
  type CreateClassificationMappingInput,
  type CreateCodeListInput,
  type CreateConceptInput,
  type CreateDomainInput,
  type CreateFrequencyInput,
  type CreateGeographicUnitInput,
  type CreateUnitMeasureInput,
} from './semantic.schemas';
import { SemanticService } from './semantic.service';

@ApiTags('Metadata governance')
@ApiBearerAuth()
@Roles(ACTOR_ROLES.METHODOLOGY_STEWARD)
@Controller('governance')
export class GovernanceController {
  constructor(
    private readonly semantics: SemanticService,
    private readonly metadata: MetadataService,
  ) {}

  @Post('domains')
  @ApiOperation({ operationId: 'createStatisticalDomain' })
  createDomain(@Body(new ZodValidationPipe(createDomainSchema)) input: CreateDomainInput) {
    return this.semantics.createDomain(input);
  }

  @Post('concepts')
  @ApiOperation({ operationId: 'createConcept' })
  createConcept(@Body(new ZodValidationPipe(createConceptSchema)) input: CreateConceptInput) {
    return this.semantics.createConcept(input);
  }

  @Post('frequencies')
  @ApiOperation({ operationId: 'createFrequency' })
  createFrequency(@Body(new ZodValidationPipe(createFrequencySchema)) input: CreateFrequencyInput) {
    return this.semantics.createFrequency(input);
  }

  @Post('units')
  @ApiOperation({ operationId: 'createUnitMeasure' })
  createUnit(@Body(new ZodValidationPipe(createUnitMeasureSchema)) input: CreateUnitMeasureInput) {
    return this.semantics.createUnitMeasure(input);
  }

  @Post('geographies')
  @ApiOperation({ operationId: 'createGeographicUnit' })
  createGeography(
    @Body(new ZodValidationPipe(createGeographicUnitSchema)) input: CreateGeographicUnitInput,
  ) {
    return this.semantics.createGeographicUnit(input);
  }

  @Post('code-lists')
  @ApiOperation({ operationId: 'createCodeList' })
  createCodeList(@Body(new ZodValidationPipe(createCodeListSchema)) input: CreateCodeListInput) {
    return this.semantics.createCodeList(input);
  }

  @Post('classifications')
  @ApiOperation({ operationId: 'createClassification' })
  createClassification(
    @Body(new ZodValidationPipe(createClassificationSchema)) input: CreateClassificationInput,
  ) {
    return this.semantics.createClassification(input);
  }

  @Post('classification-mappings')
  @ApiOperation({ operationId: 'createClassificationMapping' })
  createMapping(
    @Body(new ZodValidationPipe(createClassificationMappingSchema)) input: CreateClassificationMappingInput,
  ) {
    return this.semantics.createClassificationMapping(input);
  }

  @Post('statistical-operations')
  @ApiOperation({ operationId: 'createStatisticalOperation' })
  createOperation(
    @Body(new ZodValidationPipe(createStatisticalOperationSchema)) input: CreateStatisticalOperationInput,
  ) {
    return this.metadata.createStatisticalOperation(input);
  }

  @Post('methodologies')
  @ApiOperation({ operationId: 'createMethodology' })
  createMethodology(
    @Body(new ZodValidationPipe(createMethodologySchema)) input: CreateMethodologyInput,
  ) {
    return this.metadata.createMethodology(input);
  }

  @Post('methodologies/:id/versions')
  @ApiOperation({ operationId: 'createMethodologyVersion' })
  createMethodologyVersion(
    @Param(new ZodValidationPipe(uuidParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(createMethodologyVersionSchema)) input: MethodologyVersionInput,
  ) {
    return this.metadata.createMethodologyVersion(params.id, input);
  }

  @Post('data-structures')
  @ApiOperation({ operationId: 'createDataStructure' })
  createStructure(
    @Body(new ZodValidationPipe(createDataStructureSchema)) input: CreateDataStructureInput,
  ) {
    return this.metadata.createDataStructure(input);
  }

  @Post('datasets')
  @ApiOperation({ operationId: 'createDataset' })
  createDataset(@Body(new ZodValidationPipe(createDatasetSchema)) input: CreateDatasetInput) {
    return this.metadata.createDataset(input);
  }

  @Post('datasets/:id/versions')
  @ApiOperation({ operationId: 'createDatasetVersion' })
  createDatasetVersion(
    @Param(new ZodValidationPipe(uuidParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(createDatasetVersionSchema)) input: DatasetVersionInput,
  ) {
    return this.metadata.createDatasetVersion(params.id, input);
  }

  @Post('indicators')
  @ApiOperation({ operationId: 'createIndicator' })
  createIndicator(@Body(new ZodValidationPipe(createIndicatorSchema)) input: CreateIndicatorInput) {
    return this.metadata.createIndicator(input);
  }

  @Post('methodology-versions/:id/transitions')
  @ApiOperation({ operationId: 'transitionMethodologyVersion' })
  transitionMethodology(
    @Param(new ZodValidationPipe(uuidParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(versionTransitionSchema)) body: { targetStatus: string },
  ) {
    return this.metadata.transitionMethodologyVersion(params.id, body.targetStatus);
  }

  @Post('dataset-versions/:id/transitions')
  @ApiOperation({ operationId: 'transitionDatasetVersion' })
  transitionDataset(
    @Param(new ZodValidationPipe(uuidParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(versionTransitionSchema)) body: { targetStatus: string },
  ) {
    return this.metadata.transitionDatasetVersion(params.id, body.targetStatus);
  }
}
