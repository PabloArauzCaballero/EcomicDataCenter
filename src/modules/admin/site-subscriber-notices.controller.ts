import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { ACTOR_ROLES } from '../../common/auth/actor';
import { Roles } from '../../common/auth/auth.decorators';
import { NotFoundError } from '../../common/errors/application.error';
import { RequestId } from '../../common/http/request-id.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { AdminEnvelope } from './admin.envelope';
import { DeploymentIdentity } from './deployment-identity';
import { SubscriberNoticeRepository } from './subscriber-notice.repository';
import { toAccountSummary } from './subscription-account-row';
import { answer, send } from './subscription-envelope';
import { noticeClaimSchema, type NoticeClaim } from './subscription.schemas';

/**
 * The inputs and the ledger of the site's usage and expiry notices.
 *
 * The site's hourly job reads the candidates, decides which notice is due,
 * claims it here and sends it only on a first claim; if the send fails it
 * releases the claim, so the next run tries again. Every route takes
 * `SITE_SUBSCRIPTIONS`; the e-mails go out from the site, never from here.
 */
@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('site/subscriptions')
export class SiteSubscriberNoticesController {
  constructor(
    private readonly identity: DeploymentIdentity,
    private readonly notices: SubscriberNoticeRepository,
  ) {}

  @Get('notices/candidates')
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'listSubscriberNoticeCandidates', summary: 'Accounts to notify' })
  async candidates(@RequestId() requestId: string): Promise<AdminEnvelope<unknown>> {
    const now = new Date();
    const rows = await this.notices.candidates();
    const items = rows.map((row) => ({
      account: toAccountSummary(row.account, now),
      usage: row.usage,
      members: row.members,
    }));
    return answer(this.identity, { items }, requestId, now);
  }

  /** 201 `{claimed: true}` on the first claim, 200 `{claimed: false}` after. */
  @Post('notices/claim')
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({ operationId: 'claimSubscriberNotice', summary: 'Claim a notice before sending' })
  async claim(
    @Body(new ZodValidationPipe(noticeClaimSchema)) body: NoticeClaim,
    @RequestId() requestId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const outcome = await this.notices.claim(body);
    if (outcome === 'NO_ACCOUNT')
      throw new NotFoundError('Subscriber account', body.subscriberAccountId);
    const claimed = outcome === 'CLAIMED';
    send(
      reply,
      claimed ? HttpStatus.CREATED : HttpStatus.OK,
      answer(this.identity, { claimed }, requestId),
    );
  }

  /** 204 whether or not a claim existed: releasing is idempotent. */
  @Post('notices/release')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(ACTOR_ROLES.SITE_SUBSCRIPTIONS)
  @ApiOperation({
    operationId: 'releaseSubscriberNotice',
    summary: 'Release a claim after a failed send',
  })
  async release(@Body(new ZodValidationPipe(noticeClaimSchema)) body: NoticeClaim): Promise<void> {
    await this.notices.release(body);
  }
}
