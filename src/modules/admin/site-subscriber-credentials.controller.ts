import { Body, Controller, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { ACTOR_ROLES } from '../../common/auth/actor';
import { Roles } from '../../common/auth/auth.decorators';
import { NotFoundError, RequestValidationError } from '../../common/errors/application.error';
import { RequestId } from '../../common/http/request-id.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { AdminEnvelope } from './admin.envelope';
import { DeploymentIdentity } from './deployment-identity';
import { SubscriberAccountRepository } from './subscriber-account.repository';
import { SubscriberSessionRepository } from './subscriber-session.repository';
import { SubscriberSignInService } from './subscriber-sign-in.service';
import { toAccountSummary } from './subscription-account-row';
import { answer, send } from './subscription-envelope';
import { toMemberSummary } from './subscription-member-row';
import { hashPassword, issueToken, sha256Hex, storedForm } from './subscription-secrets';
import {
  accountParamsSchema,
  activationSchema,
  passwordChangeSchema,
  passwordResetSchema,
  type Activation,
  type PasswordChange,
  type PasswordReset,
} from './subscription.schemas';

type AccountParams = { subscriberAccountId: string };

/**
 * How an owner proves who it is in the customer area: password, one-time
 * tokens and the version that ends its open sessions.
 *
 * Every route takes `SITE_SUBSCRIPTIONS`. Spending a token, changing the
 * password and revoking all raise `session_version`; the site compares it with
 * the one in its cookie and drops a stale session. Passwords, tokens and
 * e-mails are never logged.
 */
@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('site/subscriptions')
export class SiteSubscriberCredentialsController {
  constructor(
    private readonly identity: DeploymentIdentity,
    private readonly accounts: SubscriberAccountRepository,
    private readonly sessions: SubscriberSessionRepository,
    private readonly signIns: SubscriberSignInService,
  ) {}

  @Post('accounts/:subscriberAccountId/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'changeSubscriberPassword', summary: 'Change the password' })
  async changePassword(
    @Param(new ZodValidationPipe(accountParamsSchema)) params: AccountParams,
    @Body(new ZodValidationPipe(passwordChangeSchema)) body: PasswordChange,
  ): Promise<void> {
    const id = params.subscriberAccountId;
    const target = { kind: 'OWNER', subscriberAccountId: id, memberId: null } as const;
    const found = await this.signIns.confirmPassword(target, body.currentPassword);
    if (!found) throw new NotFoundError('Subscriber account', id);
    await this.accounts.setPassword(id, await hashPassword(body.newPassword));
  }

  @Post('accounts/:subscriberAccountId/sessions/revoke')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'revokeSubscriberSessions', summary: "End the owner's sessions" })
  async revokeSessions(
    @Param(new ZodValidationPipe(accountParamsSchema)) params: AccountParams,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const account = await this.sessions.revoke(params.subscriberAccountId, false);
    if (!account) throw new NotFoundError('Subscriber account', params.subscriberAccountId);
    return answer(this.identity, { account: toAccountSummary(account) }, requestId);
  }

  @Post('activations')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({
    operationId: 'activateSubscriberAccount',
    summary: 'Spend a token, set a password',
  })
  async activate(
    @Body(new ZodValidationPipe(activationSchema)) body: Activation,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const passwordHash = await hashPassword(body.password);
    const spent = await this.accounts.activate(
      sha256Hex(body.token),
      passwordHash,
      body.termsVersion,
    );
    if (!spent) {
      throw new RequestValidationError({ token: 'The token is invalid, expired or already used' });
    }
    return answer(
      this.identity,
      {
        account: toAccountSummary(spent.account),
        member: spent.member ? toMemberSummary(spent.member) : null,
      },
      requestId,
    );
  }

  /**
   * Issues a reset token for an e-mail, or answers 202 with nothing.
   *
   * The token goes to the site, which mails the link; it is never logged. The
   * site shows the same message for 201 and 202, so a visitor cannot learn
   * from the page whether an e-mail has an account.
   */
  @Post('password-resets')
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'requestSubscriberPasswordReset', summary: 'Issue a reset token' })
  async requestReset(
    @Body(new ZodValidationPipe(passwordResetSchema)) body: PasswordReset,
    @RequestId() requestId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const token = issueToken();
    const holder = await this.accounts.issueReset(body.email, storedForm(token));
    if (!holder) {
      send(reply, HttpStatus.ACCEPTED, answer(this.identity, {}, requestId));
      return;
    }
    send(
      reply,
      HttpStatus.CREATED,
      answer(
        this.identity,
        {
          token: token.token,
          expiresAt: token.expiresAt.toISOString(),
          // The stored address: the site mails the link here, never to what was typed.
          email: holder.email,
          fullName: holder.fullName,
          memberId: holder.memberId,
        },
        requestId,
      ),
    );
  }
}
