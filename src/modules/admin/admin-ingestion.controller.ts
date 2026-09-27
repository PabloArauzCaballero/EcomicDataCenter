import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ACTOR_ROLES } from '../../common/auth/actor';
import { Roles } from '../../common/auth/auth.decorators';
import { RequestId } from '../../common/http/request-id.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { envelope, type AdminEnvelope } from './admin.envelope';
import { ingestionRunQuerySchema, type IngestionRunQuery } from './admin.schemas';
import { DeploymentIdentity } from './deployment-identity';
import { IngestionStatusService } from './ingestion-status.service';

/** The only shape this route accepts in its path. */
export const runParamsSchema = z.object({ agentRunId: z.string().uuid() });

/**
 * Sources, executions and the stages each one reached.
 *
 * Every reading here is a read. Opening a run must never be the thing that
 * retries it: a detail page that reprocessed on load would make an operator's
 * investigation indistinguishable from their decision, and the reprocessing
 * endpoint the core already exposes stays where it is.
 */
@ApiTags('Administration')
@ApiBearerAuth()
@Controller('admin/ingestion')
export class AdminIngestionController {
  constructor(
    private readonly identity: DeploymentIdentity,
    private readonly ingestion: IngestionStatusService,
  ) {}

  @Get('sources')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'listAdminSources', summary: 'Sources and their calendars' })
  async listSources(@RequestId() requestId: string): Promise<AdminEnvelope<unknown>> {
    const result = await this.ingestion.listSources();
    return envelope(
      {
        items: result.items,
        late: result.late,
        withoutSchedule: result.unknown,
      },
      {
        environmentId: this.identity.environmentId,
        requestId,
        observedAt: result.observedAt,
        evidenceState: result.items.length ? 'known' : 'unknown',
      },
    );
  }

  @Get('runs')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'listAdminIngestionRuns', summary: 'Collection executions' })
  async listRuns(
    @Query(new ZodValidationPipe(ingestionRunQuerySchema)) query: IngestionRunQuery,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const page = await this.ingestion.listRuns(query);
    return envelope(page, {
      environmentId: this.identity.environmentId,
      requestId,
      observedAt: page.items[0]?.startedAt ?? null,
      evidenceState: 'known',
    });
  }

  @Get('runs/:agentRunId')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'getAdminIngestionRun', summary: 'One execution and its stages' })
  async getRun(
    @Param(new ZodValidationPipe(runParamsSchema)) params: { agentRunId: string },
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const run = await this.ingestion.describeRun(params.agentRunId);
    return envelope(run, {
      environmentId: this.identity.environmentId,
      requestId,
      observedAt: run.startedAt,
      evidenceState: run.stagesRecorded ? 'known' : 'unknown',
    });
  }
}
