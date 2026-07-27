import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACTOR_ROLES, type Actor } from '../../common/auth/actor';
import { CurrentActor, Roles } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { ClaimQueryService } from './claim-query.service';
import { ReviewService } from './review.service';
import {
  claimQuerySchema,
  identifierParamsSchema,
  resolveContradictionSchema,
  reviewDecisionSchema,
  type ClaimQueryInput,
  type IdentifierParams,
  type ResolveContradictionInput,
  type ReviewDecisionInput,
} from './intelligence.schemas';

@ApiTags('Claim review')
@ApiBearerAuth()
@Controller('intelligence')
export class ClaimReviewController {
  constructor(
    private readonly claims: ClaimQueryService,
    private readonly reviews: ReviewService,
  ) {}

  @Post('claims/search')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD, ACTOR_ROLES.DATA_REVIEWER)
  @ApiOperation({ operationId: 'searchClaims', summary: 'Search claims with evidence' })
  search(
    @Body(new ZodValidationPipe(claimQuerySchema)) input: ClaimQueryInput,
    @CurrentActor() actor: Actor,
  ) {
    return this.claims.search(input, actor);
  }

  @Post('review-tasks/:id/decisions')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.DATA_REVIEWER, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'decideReviewTask', summary: 'Approve or reject a pending claim' })
  decide(
    @Param(new ZodValidationPipe(identifierParamsSchema)) params: IdentifierParams,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) input: ReviewDecisionInput,
    @CurrentActor() actor: Actor,
  ) {
    return this.reviews.decide(params.id, input, actor);
  }

  @Post('contradictions/:id/resolutions')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.DATA_REVIEWER, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({
    operationId: 'resolveContradiction',
    summary: 'Close a contradiction with a justification',
  })
  resolve(
    @Param(new ZodValidationPipe(identifierParamsSchema)) params: IdentifierParams,
    @Body(new ZodValidationPipe(resolveContradictionSchema)) input: ResolveContradictionInput,
    @CurrentActor() actor: Actor,
  ) {
    return this.reviews.resolveContradiction(params.id, input, actor);
  }
}
