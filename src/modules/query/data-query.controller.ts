import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACTOR_ROLES } from '../../common/auth/actor';
import { Roles } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import {
  dataQuerySchema,
  traceParamsSchema,
  type DataQueryInput,
  type TraceParams,
} from './data-query.schemas';
import { DataQueryService } from './data-query.service';

@ApiTags('Data query')
@ApiBearerAuth()
@Controller('data')
export class DataQueryController {
  constructor(private readonly service: DataQueryService) {}

  @Post('query')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({
    operationId: 'queryObservations',
    summary: 'Query current or vintage observations',
  })
  search(@Body(new ZodValidationPipe(dataQuerySchema)) input: DataQueryInput) {
    return this.service.search(input);
  }

  @Get('observations/:observationId/revisions/:revisionId/trace')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({
    operationId: 'getObservationTrace',
    summary: 'Get provenance, quality and lineage',
  })
  trace(@Param(new ZodValidationPipe(traceParamsSchema)) params: TraceParams) {
    return this.service.trace(params.observationId, params.revisionId);
  }
}
