import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACTOR_ROLES } from '../../common/auth/actor';
import { Roles } from '../../common/auth/auth.decorators';
import { ConflictError, NotFoundError } from '../../common/errors/application.error';
import { RequestId } from '../../common/http/request-id.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { AdminEnvelope } from './admin.envelope';
import { DeploymentIdentity } from './deployment-identity';
import { SubscriberMemberRepository } from './subscriber-member.repository';
import { SubscriberSignInService } from './subscriber-sign-in.service';
import { answer } from './subscription-envelope';
import { toMemberSummary } from './subscription-member-row';
import { hashPassword, issueToken, storedForm } from './subscription-secrets';
import {
  accountParamsSchema,
  memberCreationSchema,
  memberParamsSchema,
  passwordChangeSchema,
  type MemberCreation,
  type PasswordChange,
} from './subscription.schemas';

type AccountParams = { subscriberAccountId: string };
type MemberParams = { subscriberAccountId: string; memberId: string };

/**
 * The owner's team, as the customer area manages it.
 *
 * Every route takes `SITE_SUBSCRIPTIONS`. The site passes the number of seats
 * the plan allows besides the owner; the core counts ACTIVE members under the
 * account's row lock and answers 409 at the limit. An e-mail may name an owner
 * or a member, never both. The activation token is answered once, for the site
 * to mail; passwords, tokens and e-mails are never logged.
 */
@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('site/subscriptions')
export class SiteSubscriberMembersController {
  constructor(
    private readonly identity: DeploymentIdentity,
    private readonly members: SubscriberMemberRepository,
    private readonly signIns: SubscriberSignInService,
  ) {}

  @Get('accounts/:subscriberAccountId/members')
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'listSubscriberMembers', summary: 'Members of an account' })
  async list(
    @Param(new ZodValidationPipe(accountParamsSchema)) params: AccountParams,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const rows = await this.members.list(params.subscriberAccountId);
    if (!rows) throw new NotFoundError('Subscriber account', params.subscriberAccountId);
    return answer(this.identity, { items: rows.map(toMemberSummary) }, requestId);
  }

  @Post('accounts/:subscriberAccountId/members')
  @HttpCode(HttpStatus.CREATED)
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'addSubscriberMember', summary: 'Invite a member' })
  async add(
    @Param(new ZodValidationPipe(accountParamsSchema)) params: AccountParams,
    @Body(new ZodValidationPipe(memberCreationSchema)) body: MemberCreation,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const id = params.subscriberAccountId;
    const token = issueToken();
    const result = await this.members.add(id, body, storedForm(token));
    if (result.outcome === 'NO_ACCOUNT') throw new NotFoundError('Subscriber account', id);
    if (result.outcome === 'EMAIL_IN_USE') {
      throw new ConflictError('This e-mail already belongs to an account or a member', {
        reason: 'EMAIL_IN_USE',
      });
    }
    if (result.outcome === 'LIMIT_REACHED') {
      throw new ConflictError('The plan has no seat left for another member', {
        reason: 'LIMIT_REACHED',
        active: result.active,
        maxMembers: body.maxMembers,
      });
    }
    return answer(
      this.identity,
      {
        member: toMemberSummary(result.member),
        activationToken: token.token,
        activationExpiresAt: token.expiresAt.toISOString(),
      },
      requestId,
    );
  }

  @Get('accounts/:subscriberAccountId/members/:memberId')
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'getSubscriberMember', summary: 'One member, with its version' })
  async member(
    @Param(new ZodValidationPipe(memberParamsSchema)) params: MemberParams,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const row = await this.members.find(params.subscriberAccountId, params.memberId);
    if (!row) throw new NotFoundError('Subscriber member', params.memberId);
    return answer(this.identity, { member: toMemberSummary(row) }, requestId);
  }

  @Post('accounts/:subscriberAccountId/members/:memberId/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'removeSubscriberMember', summary: 'Remove a member' })
  async remove(
    @Param(new ZodValidationPipe(memberParamsSchema)) params: MemberParams,
  ): Promise<void> {
    const removed = await this.members.remove(params.subscriberAccountId, params.memberId);
    if (!removed) throw new NotFoundError('Subscriber member', params.memberId);
  }

  @Post('accounts/:subscriberAccountId/members/:memberId/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({
    operationId: 'changeSubscriberMemberPassword',
    summary: "Change a member's password",
  })
  async changePassword(
    @Param(new ZodValidationPipe(memberParamsSchema)) params: MemberParams,
    @Body(new ZodValidationPipe(passwordChangeSchema)) body: PasswordChange,
  ): Promise<void> {
    const { subscriberAccountId, memberId } = params;
    const target = { kind: 'MEMBER', subscriberAccountId, memberId } as const;
    const found = await this.signIns.confirmPassword(target, body.currentPassword);
    if (!found) throw new NotFoundError('Subscriber member', memberId);
    await this.members.setPassword(
      subscriberAccountId,
      memberId,
      await hashPassword(body.newPassword),
    );
  }
}
