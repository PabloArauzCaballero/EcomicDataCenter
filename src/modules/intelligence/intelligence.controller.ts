import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { ACTOR_ROLES, type Actor } from '../../common/auth/actor';
import { CurrentActor, Roles } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AgentRegistryService } from './agent-registry.service';
import { DailyAnalysisService } from './daily-analysis.service';
import { ReprocessingService } from './reprocessing.service';
import { ReviewService } from './review.service';
import { SubmissionService } from './submission.service';
import {
  completeAgentRunSchema,
  deadLetterQuerySchema,
  identifierParamsSchema,
  numericIdParamsSchema,
  openAgentRunSchema,
  registerAgentSchema,
  submitDailyAnalysisSchema,
  submitObservationsSchema,
  sweepAbandonedSchema,
  type CompleteAgentRunInput,
  type DeadLetterQueryInput,
  type IdentifierParams,
  type NumericIdParams,
  type OpenAgentRunInput,
  type RegisterAgentInput,
  type SubmitDailyAnalysisInput,
  type SubmitObservationsInput,
  type SweepAbandonedInput,
} from './intelligence.schemas';

@ApiTags('Agent intelligence')
@ApiBearerAuth()
@Controller('intelligence')
export class IntelligenceController {
  constructor(
    private readonly agents: AgentRegistryService,
    private readonly submissions: SubmissionService,
    private readonly reviews: ReviewService,
    private readonly reprocessing: ReprocessingService,
    private readonly daily: DailyAnalysisService,
  ) {}

  @Post('agents')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'registerAgent', summary: 'Register an autonomous collector' })
  registerAgent(
    @Body(new ZodValidationPipe(registerAgentSchema)) input: RegisterAgentInput,
    @CurrentActor() actor: Actor,
  ) {
    return this.agents.register(input, actor);
  }

  @Post('agent-runs')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.INGESTION_AGENT)
  @ApiOperation({ operationId: 'openAgentRun', summary: 'Open an agent execution' })
  openRun(
    @Body(new ZodValidationPipe(openAgentRunSchema)) input: OpenAgentRunInput,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    return this.agents.open(input, actor, String(request.id));
  }

  @Get('agent-runs/:id')
  @Roles(ACTOR_ROLES.INGESTION_AGENT, ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'getAgentRun', summary: 'Get agent execution status' })
  getRun(
    @Param(new ZodValidationPipe(identifierParamsSchema)) params: IdentifierParams,
    @CurrentActor() actor: Actor,
  ) {
    return this.agents.status(params.id, actor);
  }

  @Post('agent-runs/:id/submissions')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.INGESTION_AGENT)
  @ApiOperation({
    operationId: 'submitAgentObservations',
    summary: 'Submit up to 200 collected items',
  })
  submit(
    @Param(new ZodValidationPipe(identifierParamsSchema)) params: IdentifierParams,
    @Body(new ZodValidationPipe(submitObservationsSchema)) input: SubmitObservationsInput,
    @CurrentActor() actor: Actor,
  ) {
    return this.submissions.submit(params.id, input, actor);
  }

  @Get('dead-letters')
  @Roles(ACTOR_ROLES.METHODOLOGY_STEWARD, ACTOR_ROLES.DATA_REVIEWER)
  @ApiOperation({
    operationId: 'listDeadLetters',
    summary: 'List items that exhausted their reprocessing attempts',
  })
  deadLetters(@Query(new ZodValidationPipe(deadLetterQuerySchema)) query: DeadLetterQueryInput) {
    return this.reprocessing.deadLetters(query.agentRunId);
  }

  @Post('raw-observations/:id/reprocessing')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.METHODOLOGY_STEWARD, ACTOR_ROLES.DATA_REVIEWER)
  @ApiOperation({
    operationId: 'reprocessRawObservation',
    summary: 'Requeue a rejected or quarantined item',
  })
  reprocess(@Param(new ZodValidationPipe(numericIdParamsSchema)) params: NumericIdParams) {
    return this.reprocessing.reprocess(params.id);
  }

  @Post('raw-observations/sweep')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({
    operationId: 'sweepAbandonedRawObservations',
    summary: 'Dead-letter items abandoned in flight after a restart',
  })
  sweep(@Body(new ZodValidationPipe(sweepAbandonedSchema)) input: SweepAbandonedInput) {
    return this.reprocessing.sweepAbandoned(input.olderThanMinutes);
  }

  @Post('daily-analysis')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.INGESTION_AGENT)
  @ApiOperation({
    operationId: 'submitDailyAnalysis',
    summary: 'Open a run, submit the daily claims and close the run in one call',
  })
  dailyAnalysis(
    @Body(new ZodValidationPipe(submitDailyAnalysisSchema)) input: SubmitDailyAnalysisInput,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    return this.daily.run(input, actor, String(request.id));
  }

  @Post('agent-runs/:id/completion')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.INGESTION_AGENT)
  @ApiOperation({ operationId: 'completeAgentRun', summary: 'Close an agent execution' })
  complete(
    @Param(new ZodValidationPipe(identifierParamsSchema)) params: IdentifierParams,
    @Body(new ZodValidationPipe(completeAgentRunSchema)) input: CompleteAgentRunInput,
    @CurrentActor() actor: Actor,
  ) {
    return this.reviews.completeRun(params.id, input, actor);
  }
}
