import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACTOR_ROLES } from '../../common/auth/actor';
import { Roles } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import {
  createIndicatorRelationSchema,
  createLineageRelationSchema,
  createQualityDimensionSchema,
  createQualityRuleSchema,
  createSeriesBreakSchema,
  issueListSchema,
  issueParamsSchema,
  issueTransitionSchema,
  type CreateIndicatorRelationInput,
  type CreateLineageRelationInput,
  type CreateQualityDimensionInput,
  type CreateQualityRuleInput,
  type CreateSeriesBreakInput,
  type IssueListInput,
  type IssueTransitionInput,
} from './quality.schemas';
import { QualityService } from './quality.service';

@ApiTags('Quality and lineage')
@ApiBearerAuth()
@Controller('quality')
export class QualityController {
  constructor(private readonly service: QualityService) {}

  @Post('dimensions')
  @Roles(ACTOR_ROLES.METHODOLOGY_STEWARD)
  createDimension(
    @Body(new ZodValidationPipe(createQualityDimensionSchema)) input: CreateQualityDimensionInput,
  ) {
    return this.service.createDimension(input);
  }

  @Post('rules')
  @Roles(ACTOR_ROLES.METHODOLOGY_STEWARD)
  createRule(@Body(new ZodValidationPipe(createQualityRuleSchema)) input: CreateQualityRuleInput) {
    return this.service.createRule(input);
  }

  @Post('lineage-relations')
  @Roles(ACTOR_ROLES.METHODOLOGY_STEWARD)
  createLineage(
    @Body(new ZodValidationPipe(createLineageRelationSchema)) input: CreateLineageRelationInput,
  ) {
    return this.service.createLineage(input);
  }

  @Post('indicator-relations')
  @Roles(ACTOR_ROLES.METHODOLOGY_STEWARD)
  createIndicatorRelation(
    @Body(new ZodValidationPipe(createIndicatorRelationSchema)) input: CreateIndicatorRelationInput,
  ) {
    return this.service.createIndicatorRelation(input);
  }

  @Post('series-breaks')
  @Roles(ACTOR_ROLES.METHODOLOGY_STEWARD)
  createSeriesBreak(
    @Body(new ZodValidationPipe(createSeriesBreakSchema)) input: CreateSeriesBreakInput,
  ) {
    return this.service.createSeriesBreak(input);
  }

  @Get('issues')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD, ACTOR_ROLES.DATA_OFFICER)
  listIssues(@Query(new ZodValidationPipe(issueListSchema)) query: IssueListInput) {
    return this.service.listIssues(query);
  }

  @Post('issues/:id/transitions')
  @Roles(ACTOR_ROLES.METHODOLOGY_STEWARD, ACTOR_ROLES.DATA_OFFICER)
  @ApiOperation({ operationId: 'transitionDataIssue' })
  transitionIssue(
    @Param(new ZodValidationPipe(issueParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(issueTransitionSchema)) input: IssueTransitionInput,
  ) {
    return this.service.transitionIssue(params.id, input);
  }
}
