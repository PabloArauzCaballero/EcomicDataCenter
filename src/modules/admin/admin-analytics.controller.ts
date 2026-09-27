import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACTOR_ROLES } from '../../common/auth/actor';
import { Roles } from '../../common/auth/auth.decorators';
import { RequestId } from '../../common/http/request-id.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { paginate } from './admin-cursor';
import { envelope, shareOrNull, type AdminEnvelope } from './admin.envelope';
import {
  exportQuerySchema,
  trafficQuerySchema,
  type ExportQuery,
  type TrafficQuery,
} from './admin.schemas';
import { AnalyticsIntakeRepository } from './analytics-intake.repository';
import { AnalyticsViewRepository } from './analytics-view.repository';
import {
  exportEventSchema,
  trafficBatchSchema,
  type ExportEvent,
  type TrafficBatch,
} from './analytics.schemas';
import { DeploymentIdentity } from './deployment-identity';

/**
 * What the public site reports about itself, and what the console reads back.
 *
 * The two intake routes are the only ones in the portal a machine calls, and
 * they carry a role of their own — `SITE_TELEMETRY` — so a compromised web tier
 * can inflate a page-view counter and nothing else. Giving the site the
 * collector's role would have been one line shorter and would have let it
 * submit economic observations.
 */
@ApiTags('Administration')
@ApiBearerAuth()
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(
    private readonly identity: DeploymentIdentity,
    private readonly view: AnalyticsViewRepository,
    private readonly intake: AnalyticsIntakeRepository,
  ) {}

  @Get('traffic')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'getAdminTraffic', summary: 'Traffic with its coverage' })
  async traffic(
    @Query(new ZodValidationPipe(trafficQuerySchema)) query: TrafficQuery,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const [buckets, coverage] = await Promise.all([
      this.view.traffic(query),
      this.view.trafficCoverage(),
    ]);
    const measured = Number(coverage.total_events) > 0;
    return envelope(
      {
        granularity: query.granularity,
        buckets: buckets.map((bucket) => ({
          bucket: bucket.bucket.toISOString(),
          route: bucket.route,
          kind: bucket.event_kind,
          device: bucket.device_category,
          referrer: bucket.referrer_category,
          views: Number(bucket.views),
          /*
           * Estimated sessions, not people. The bucket rotates, so two visits a
           * day apart are two, and a household behind one address may be one.
           * Calling it «visitors» without this note would be a promise the
           * measurement cannot keep.
           */
          estimatedSessions: Number(bucket.visitors),
        })),
        coverage: {
          measured,
          firstEventAt: coverage.first_event_at ? coverage.first_event_at.toISOString() : null,
          lastEventAt: coverage.last_event_at ? coverage.last_event_at.toISOString() : null,
          totalEvents: measured ? Number(coverage.total_events) : null,
          robotShare: shareOrNull(Number(coverage.robot_events), Number(coverage.total_events)),
        },
      },
      {
        environmentId: this.identity.environmentId,
        requestId,
        observedAt: coverage.last_event_at,
        evidenceState: measured ? 'known' : 'unknown',
      },
    );
  }

  @Get('exports')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'listAdminExports', summary: 'Export requests and results' })
  async exports(
    @Query(new ZodValidationPipe(exportQuerySchema)) query: ExportQuery,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const [rows, summary] = await Promise.all([
      this.view.exports(query),
      this.view.exportSummary(),
    ]);
    const page = paginate(rows, query.pageSize, (row) => ({
      occurredAt: row.occurred_at.toISOString(),
      identifier: row.export_request_id,
    }));
    return envelope(
      {
        items: page.items.map((row) => ({
          exportRequestId: row.export_request_id,
          requestId: row.request_id,
          datasetCode: row.dataset_code,
          format: row.export_format,
          status: row.status,
          filters: row.filters_json,
          rowCount: row.row_count === null ? null : Number(row.row_count),
          byteCount: row.byte_count === null ? null : Number(row.byte_count),
          durationMs: row.duration_ms,
          truncated: row.truncated,
          occurredAt: row.occurred_at.toISOString(),
          errorCode: row.error_code,
        })),
        nextCursor: page.nextCursor,
        summary: summary.map((entry) => ({
          datasetCode: entry.dataset_code,
          status: entry.status,
          requests: Number(entry.requests),
          rows: entry.rows === null ? null : Number(entry.rows),
        })),
        /*
         * Stated, not implied: a completed transfer is not measured anywhere in
         * this deployment, so it is not reported. A generated file is a file the
         * server built; whether the reader received it is a different fact and
         * nothing here observes it.
         */
        measures: ['REQUESTED', 'GENERATED', 'FAILED'],
      },
      {
        environmentId: this.identity.environmentId,
        requestId,
        observedAt: page.items[0]?.occurred_at ?? null,
        evidenceState: rows.length ? 'known' : 'unknown',
      },
    );
  }

  @Post('traffic')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(ACTOR_ROLES.SITE_TELEMETRY)
  @ApiOperation({ operationId: 'recordSiteTraffic', summary: 'Report page views' })
  async recordTraffic(
    @Body(new ZodValidationPipe(trafficBatchSchema)) batch: TrafficBatch,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const result = await this.intake.recordTraffic(batch);
    return envelope(result, {
      environmentId: this.identity.environmentId,
      requestId,
      observedAt: new Date(),
      evidenceState: 'known',
    });
  }

  @Post('exports')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(ACTOR_ROLES.SITE_TELEMETRY)
  @ApiOperation({ operationId: 'recordExportEvent', summary: 'Report one export stage' })
  async recordExport(
    @Body(new ZodValidationPipe(exportEventSchema)) event: ExportEvent,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    await this.intake.recordExport(event);
    return envelope(
      { requestId: event.requestId, status: event.status },
      {
        environmentId: this.identity.environmentId,
        requestId,
        observedAt: new Date(),
        evidenceState: 'known',
      },
    );
  }
}
