import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACTOR_ROLES, type Actor } from '../../common/auth/actor';
import { CurrentActor, Roles } from '../../common/auth/auth.decorators';
import { ConflictError, NotFoundError } from '../../common/errors/application.error';
import { RequestId } from '../../common/http/request-id.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { paginate } from './admin-cursor';
import { envelope, type AdminEnvelope } from './admin.envelope';
import { DeploymentIdentity } from './deployment-identity';
import { SubscriberAdminRepository, type PaymentRow } from './subscriber-admin.repository';
import { endOfLaPazDay, toAccountSummary } from './subscription-account-row';
import { issueToken } from './subscription-secrets';
import {
  accountCreationSchema,
  accountListQuerySchema,
  accountParamsSchema,
  accountUpdateSchema,
  paymentSchema,
  tokenRequestSchema,
  USAGE_KINDS,
  type AccountCreation,
  type AccountListQuery,
  type AccountUpdate,
  type Payment,
  type TokenRequest,
} from './subscription.schemas';

type AccountParams = { subscriberAccountId: string };
const DAY_MS = 24 * 60 * 60 * 1000;

function toPaymentItem(row: PaymentRow) {
  return {
    subscriberPaymentId: row.subscriber_payment_id,
    subscriberAccountId: row.subscriber_account_id,
    amountBob: row.amount_bob,
    coversUntil: row.covers_until,
    reference: row.reference,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at.toISOString(),
  };
}

/**
 * The operator's console over paying subscribers.
 *
 * Every route takes `SUBSCRIPTION_ADMIN` and nothing else: these rows hold a
 * person's e-mail and the money they paid, and no analyst, steward or site
 * identity has a reason to read or change them. Activation and reset tokens are
 * returned once, here, for the operator to hand to the customer; only their
 * SHA-256 is stored.
 */
@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('admin/subscriptions')
export class AdminSubscriptionsController {
  constructor(
    private readonly identity: DeploymentIdentity,
    private readonly register: SubscriberAdminRepository,
  ) {}

  private wrap<T>(data: T, requestId: string, observedAt: Date | null = new Date()) {
    return envelope(data, {
      environmentId: this.identity.environmentId,
      requestId,
      observedAt,
      evidenceState: 'known',
    });
  }

  @Get('accounts')
  @Roles(ACTOR_ROLES.SUBSCRIPTION_ADMIN)
  @ApiOperation({ operationId: 'listSubscriberAccounts', summary: 'Subscribers, newest first' })
  async list(
    @Query(new ZodValidationPipe(accountListQuerySchema)) query: AccountListQuery,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const rows = await this.register.list(query);
    const page = paginate(rows, query.pageSize, (row) => ({
      occurredAt: row.created_at_key,
      identifier: row.subscriber_account_id,
    }));
    const usage = await this.register.currentUsage(
      page.items.map((row) => row.subscriber_account_id),
    );
    const items = page.items.map((row) => {
      const counts = usage.get(row.subscriber_account_id);
      return {
        account: toAccountSummary(row),
        usage: USAGE_KINDS.map((usageKind) => ({ usageKind, used: counts?.get(usageKind) ?? 0 })),
      };
    });
    return this.wrap({ items, nextCursor: page.nextCursor }, requestId);
  }

  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  @Roles(ACTOR_ROLES.SUBSCRIPTION_ADMIN)
  @ApiOperation({ operationId: 'createSubscriberAccount', summary: 'Open an account' })
  async create(
    @Body(new ZodValidationPipe(accountCreationSchema)) body: AccountCreation,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const now = new Date();
    const trial = body.trialDays > 0;
    const paidUntil = trial ? new Date(now.getTime() + body.trialDays * DAY_MS) : null;
    const token = issueToken(now);
    const account = await this.register.create(body, trial ? 'TRIAL' : 'PENDING', paidUntil, token);
    if (!account) throw new ConflictError('An account with this e-mail already exists');
    return this.wrap(
      {
        account: toAccountSummary(account),
        activationToken: token.token,
        activationExpiresAt: token.expiresAt.toISOString(),
      },
      requestId,
    );
  }

  @Patch('accounts/:subscriberAccountId')
  @Roles(ACTOR_ROLES.SUBSCRIPTION_ADMIN)
  @ApiOperation({ operationId: 'updateSubscriberAccount', summary: 'Change plan, state or data' })
  async update(
    @Param(new ZodValidationPipe(accountParamsSchema)) params: AccountParams,
    @Body(new ZodValidationPipe(accountUpdateSchema)) change: AccountUpdate,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const account = await this.register.update(params.subscriberAccountId, change);
    if (!account) throw new NotFoundError('Subscriber account', params.subscriberAccountId);
    return this.wrap({ account: toAccountSummary(account) }, requestId);
  }

  @Post('accounts/:subscriberAccountId/payments')
  @HttpCode(HttpStatus.CREATED)
  @Roles(ACTOR_ROLES.SUBSCRIPTION_ADMIN)
  @ApiOperation({ operationId: 'recordSubscriberPayment', summary: 'Record a payment' })
  async recordPayment(
    @Param(new ZodValidationPipe(accountParamsSchema)) params: AccountParams,
    @Body(new ZodValidationPipe(paymentSchema)) payment: Payment,
    @CurrentActor() actor: Actor,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const result = await this.register.recordPayment(
      params.subscriberAccountId,
      payment,
      endOfLaPazDay(payment.coversUntil),
      actor.subject,
    );
    if (!result) throw new NotFoundError('Subscriber account', params.subscriberAccountId);
    return this.wrap(
      { payment: toPaymentItem(result.payment), account: toAccountSummary(result.account) },
      requestId,
    );
  }

  @Get('accounts/:subscriberAccountId/payments')
  @Roles(ACTOR_ROLES.SUBSCRIPTION_ADMIN)
  @ApiOperation({ operationId: 'listSubscriberPayments', summary: 'Payments of one account' })
  async payments(
    @Param(new ZodValidationPipe(accountParamsSchema)) params: AccountParams,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const rows = await this.register.listPayments(params.subscriberAccountId);
    return this.wrap({ items: rows.map(toPaymentItem) }, requestId, rows[0]?.recorded_at ?? null);
  }

  @Post('accounts/:subscriberAccountId/tokens')
  @HttpCode(HttpStatus.CREATED)
  @Roles(ACTOR_ROLES.SUBSCRIPTION_ADMIN)
  @ApiOperation({
    operationId: 'issueSubscriberToken',
    summary: 'Issue an activation or reset token',
  })
  async issueToken(
    @Param(new ZodValidationPipe(accountParamsSchema)) params: AccountParams,
    @Body(new ZodValidationPipe(tokenRequestSchema)) body: TokenRequest,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const token = issueToken();
    const stored = await this.register.issueToken(params.subscriberAccountId, body.purpose, token);
    if (!stored) throw new NotFoundError('Subscriber account', params.subscriberAccountId);
    return this.wrap({ token: token.token, expiresAt: token.expiresAt.toISOString() }, requestId);
  }
}
