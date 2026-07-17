import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACTOR_ROLES } from '../../common/auth/actor';
import { Roles } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import {
  createOrganizationSchema,
  createSourceArtifactSchema,
  createSourceSchema,
  idParamsSchema,
  listProvenanceSchema,
  type CreateOrganizationInput,
  type CreateSourceArtifactInput,
  type CreateSourceInput,
  type ListProvenanceInput,
} from './provenance.schemas';
import { ProvenanceService } from './provenance.service';

@ApiTags('Provenance')
@ApiBearerAuth()
@Controller('provenance')
export class ProvenanceController {
  constructor(private readonly service: ProvenanceService) {}

  @Post('organizations')
  @Roles(ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'createOrganization' })
  createOrganization(
    @Body(new ZodValidationPipe(createOrganizationSchema)) input: CreateOrganizationInput,
  ) {
    return this.service.createOrganization(input);
  }

  @Get('organizations')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD, ACTOR_ROLES.DATA_OFFICER)
  listOrganizations(
    @Query(new ZodValidationPipe(listProvenanceSchema)) query: ListProvenanceInput,
  ) {
    return this.service.listOrganizations(query);
  }

  @Post('sources')
  @Roles(ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'createSource' })
  createSource(@Body(new ZodValidationPipe(createSourceSchema)) input: CreateSourceInput) {
    return this.service.createSource(input);
  }

  @Get('sources')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD, ACTOR_ROLES.DATA_OFFICER)
  listSources(@Query(new ZodValidationPipe(listProvenanceSchema)) query: ListProvenanceInput) {
    return this.service.listSources(query);
  }

  @Post('artifacts')
  @Roles(ACTOR_ROLES.DATA_OFFICER, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'registerSourceArtifact' })
  registerArtifact(
    @Body(new ZodValidationPipe(createSourceArtifactSchema)) input: CreateSourceArtifactInput,
  ) {
    return this.service.registerArtifact(input);
  }

  @Get('artifacts/:id')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD, ACTOR_ROLES.DATA_OFFICER)
  getArtifact(@Param(new ZodValidationPipe(idParamsSchema)) params: { id: string }) {
    return this.service.getArtifact(params.id);
  }
}
