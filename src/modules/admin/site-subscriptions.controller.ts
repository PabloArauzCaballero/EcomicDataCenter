import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACTOR_ROLES } from '../../common/auth/actor';
import { Roles } from '../../common/auth/auth.decorators';
import { ConflictError, NotFoundError } from '../../common/errors/application.error';
import { RequestId } from '../../common/http/request-id.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { AdminEnvelope } from './admin.envelope';
import { DeploymentIdentity } from './deployment-identity';
import { answer } from './subscription-envelope';
import { SubscriberAccountRepository } from './subscriber-account.repository';
import { SubscriberAdminRepository } from './subscriber-admin.repository';
import { SubscriberKeyRepository } from './subscriber-key.repository';
import { SubscriberSignInService } from './subscriber-sign-in.service';
import { toAccountSummary } from './subscription-account-row';
import { toMemberSummary } from './subscription-member-row';
import { issueApiKey } from './subscription-secrets';
import {
  accountParamsSchema,
  apiKeyCreationSchema,
  apiKeyParamsSchema,
  apiKeyVerificationSchema,
  profileUpdateSchema,
  sessionSchema,
  usageIncrementSchema,
  type ApiKeyCreation,
  type ApiKeyVerification,
  type ProfileUpdate,
  type Session,
  type UsageIncrement,
} from './subscription.schemas';

type AccountParams = { subscriberAccountId: string };

/**
 * The customer area of the public site (/cuenta), as the site sees it.
 *
 * Every route takes the site's own machine role, `SITE_SUBSCRIPTIONS`; the
 * customer's identity is established by the site after `POST /sessions` and
 * passed as the account in the path. This role can sign customers in, manage
 * their keys and invoicing data, and meter usage — never open accounts, record
 * payments or change plans, which belong to `SUBSCRIPTION_ADMIN`. Passwords,
 * tokens and members have their own controllers on the same base path.
 *
 * Passwords, tokens, keys and e-mails are never logged; the audit interceptor
 * records only the names of body fields.
 */
@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('site/subscriptions')
export class SiteSubscriptionsController {
  constructor(
    private readonly identity: DeploymentIdentity,
    private readonly accounts: SubscriberAccountRepository,
    private readonly register: SubscriberAdminRepository,
    private readonly keys: SubscriberKeyRepository,
    private readonly signIns: SubscriberSignInService,
  ) {}

  @Post('sessions')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'openSubscriberSession', summary: 'Sign in an owner or member' })
  async signIn(
    @Body(new ZodValidationPipe(sessionSchema)) session: Session,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const principal = await this.signIns.signIn(session.email, session.password);
    return answer(
      this.identity,
      {
        account: toAccountSummary(principal.account),
        member: principal.member ? toMemberSummary(principal.member) : null,
      },
      requestId,
    );
  }

  @Get('accounts/:subscriberAccountId')
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'getSubscriberAccount', summary: 'Account, usage and keys' })
  async account(
    @Param(new ZodValidationPipe(accountParamsSchema)) params: AccountParams,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const id = params.subscriberAccountId;
    const account = await this.accounts.findById(id);
    if (!account) throw new NotFoundError('Subscriber account', id);
    const [usage, keys] = await Promise.all([
      this.accounts.currentUsage(id),
      this.accounts.listApiKeys(id),
    ]);
    return answer(
      this.identity,
      {
        account: toAccountSummary(account),
        usage,
        apiKeys: keys.map((key) => ({
          apiKeyId: key.api_key_id,
          prefix: key.key_prefix,
          label: key.label,
          createdAt: key.created_at.toISOString(),
          lastUsedAt: key.last_used_at ? key.last_used_at.toISOString() : null,
          revokedAt: key.revoked_at ? key.revoked_at.toISOString() : null,
        })),
      },
      requestId,
    );
  }

  /** The customer's own invoicing data; plan and state stay the operator's. */
  @Patch('accounts/:subscriberAccountId')
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'updateSubscriberProfile', summary: 'Change invoicing data' })
  async updateProfile(
    @Param(new ZodValidationPipe(accountParamsSchema)) params: AccountParams,
    @Body(new ZodValidationPipe(profileUpdateSchema)) change: ProfileUpdate,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const account = await this.register.update(params.subscriberAccountId, change);
    if (!account) throw new NotFoundError('Subscriber account', params.subscriberAccountId);
    return answer(this.identity, { account: toAccountSummary(account) }, requestId);
  }

  @Post('accounts/:subscriberAccountId/api-keys')
  @HttpCode(HttpStatus.CREATED)
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'createSubscriberApiKey', summary: 'Mint an API key, shown once' })
  async createKey(
    @Param(new ZodValidationPipe(accountParamsSchema)) params: AccountParams,
    @Body(new ZodValidationPipe(apiKeyCreationSchema)) body: ApiKeyCreation,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const issued = issueApiKey();
    const id = params.subscriberAccountId;
    // Only the prefix and the hash go to storage; the key itself is answered once.
    const result = await this.keys.create(id, body.label, body.maxActiveKeys, {
      prefix: issued.prefix,
      hash: issued.hash,
    });
    if (result.outcome === 'NO_ACCOUNT') throw new NotFoundError('Subscriber account', id);
    if (result.outcome === 'LIMIT_REACHED') {
      throw new ConflictError('The account already holds its maximum of active keys', {
        active: result.active,
        maxActiveKeys: body.maxActiveKeys,
      });
    }
    return answer(
      this.identity,
      { apiKeyId: result.apiKeyId, prefix: issued.prefix, key: issued.key },
      requestId,
    );
  }

  @Post('accounts/:subscriberAccountId/api-keys/:apiKeyId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'revokeSubscriberApiKey', summary: 'Revoke one API key' })
  async revokeKey(
    @Param(new ZodValidationPipe(apiKeyParamsSchema))
    params: {
      subscriberAccountId: string;
      apiKeyId: string;
    },
  ): Promise<void> {
    const revoked = await this.keys.revoke(params.subscriberAccountId, params.apiKeyId);
    if (!revoked) throw new NotFoundError('API key', params.apiKeyId);
  }

  @Post('usage')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'recordSubscriberUsage', summary: "Add to this month's counter" })
  async recordUsage(
    @Body(new ZodValidationPipe(usageIncrementSchema)) body: UsageIncrement,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const used = await this.keys.increment(body.subscriberAccountId, body.usageKind, body.amount);
    if (used === null) throw new NotFoundError('Subscriber account', body.subscriberAccountId);
    return answer(this.identity, { used }, requestId);
  }

  @Post('api-keys/verify')
  @HttpCode(HttpStatus.OK)
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'verifySubscriberApiKey', summary: 'Resolve and meter an API key' })
  async verifyKey(
    @Body(new ZodValidationPipe(apiKeyVerificationSchema)) body: ApiKeyVerification,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const result = await this.keys.verify(body.keyHash, body.usageKind, body.amount);
    if (!result) throw new NotFoundError('API key', 'presented key');
    return answer(
      this.identity,
      { account: toAccountSummary(result.account), used: result.used },
      requestId,
    );
  }
}
