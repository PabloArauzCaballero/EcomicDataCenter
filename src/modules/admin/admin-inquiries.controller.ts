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
import { NotFoundError } from '../../common/errors/application.error';
import { RequestId } from '../../common/http/request-id.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { paginate } from './admin-cursor';
import { envelope, type AdminEnvelope } from './admin.envelope';
import { DeploymentIdentity } from './deployment-identity';
import { toInquiryItem } from './inquiry-row';
import { InquiryViewRepository } from './inquiry-view.repository';
import { InquiryWriteRepository } from './inquiry-write.repository';
import {
  inquiryListQuerySchema,
  inquiryParamsSchema,
  inquirySubmissionSchema,
  inquiryUpdateSchema,
  type InquiryListQuery,
  type InquirySubmission,
  type InquiryUpdate,
} from './inquiry.schemas';

/**
 * The «contact our services» inbox: the site writes to it, operators work it.
 *
 * Submitting carries its own machine role, `SITE_INQUIRY`, and that role can do
 * nothing else — in particular it cannot read the inbox it fills, so a leaked
 * form token exposes no one's e-mail. Reading and updating belong to the
 * commercial operator (`SUBSCRIPTION_ADMIN`) alone: every row holds a person's
 * name, e-mail, phone and words, and the console's other roles — analysts,
 * stewards, seed operators — have no reason to see them. The operator, in
 * turn, inherits no catalogue or methodology right.
 */
@ApiTags('Administration')
@ApiBearerAuth()
@Controller('admin/inquiries')
export class AdminInquiriesController {
  constructor(
    private readonly identity: DeploymentIdentity,
    private readonly view: InquiryViewRepository,
    private readonly writes: InquiryWriteRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(ACTOR_ROLES.SITE_INQUIRY)
  @ApiOperation({ operationId: 'submitServiceInquiry', summary: 'Submit a service inquiry' })
  async submit(
    @Body(new ZodValidationPipe(inquirySubmissionSchema)) inquiry: InquirySubmission,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const receipt = await this.writes.submit(inquiry);
    return envelope(
      {
        serviceInquiryId: receipt.serviceInquiryId,
        /*
         * Always NEW, also for a repeated delivery: the site's identity may not
         * read the inbox, and echoing the state an operator has since set would
         * let it.
         */
        status: 'NEW' as const,
        duplicate: receipt.duplicate,
      },
      {
        environmentId: this.identity.environmentId,
        requestId,
        observedAt: new Date(),
        evidenceState: 'known',
      },
    );
  }

  @Get()
  @Roles(ACTOR_ROLES.SUBSCRIPTION_ADMIN)
  @ApiOperation({ operationId: 'listServiceInquiries', summary: 'Service inquiries, newest first' })
  async list(
    @Query(new ZodValidationPipe(inquiryListQuerySchema)) query: InquiryListQuery,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const [rows, summary] = await Promise.all([this.view.list(query), this.view.summary()]);
    const page = paginate(rows, query.pageSize, (row) => ({
      occurredAt: row.created_at_key,
      identifier: row.service_inquiry_id,
    }));
    return envelope(
      { items: page.items.map(toInquiryItem), nextCursor: page.nextCursor, summary },
      {
        environmentId: this.identity.environmentId,
        requestId,
        observedAt: page.items[0]?.created_at ?? null,
        evidenceState: 'known',
      },
    );
  }

  @Patch(':serviceInquiryId')
  @Roles(ACTOR_ROLES.SUBSCRIPTION_ADMIN)
  @ApiOperation({ operationId: 'updateServiceInquiry', summary: 'Change the state of an inquiry' })
  async update(
    @Param(new ZodValidationPipe(inquiryParamsSchema)) params: { serviceInquiryId: string },
    @Body(new ZodValidationPipe(inquiryUpdateSchema)) change: InquiryUpdate,
    @CurrentActor() actor: Actor,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const row = await this.writes.update(params.serviceInquiryId, change, actor.subject);
    if (!row) throw new NotFoundError('Service inquiry', params.serviceInquiryId);
    return envelope(toInquiryItem(row), {
      environmentId: this.identity.environmentId,
      requestId,
      observedAt: row.updated_at,
      evidenceState: 'known',
    });
  }
}
