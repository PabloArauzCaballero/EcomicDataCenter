import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACTOR_ROLES, type Actor } from '../../common/auth/actor';
import { CurrentActor, Roles } from '../../common/auth/auth.decorators';
import { RequestId } from '../../common/http/request-id.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { paginate } from './admin-cursor';
import { AdminOverviewService } from './admin-overview.service';
import { envelope, type AdminEnvelope } from './admin.envelope';
import {
  auditQuerySchema,
  metadataParamsSchema,
  type AuditQuery,
  type MetadataCatalog,
} from './admin.schemas';
import { AuditViewRepository } from './audit-view.repository';
import { DeploymentIdentity } from './deployment-identity';
import { HealthViewRepository } from './health-view.repository';
import { MetadataViewRepository } from './metadata-view.repository';

const AVAILABILITY_WINDOW_HOURS = 24;
const INCIDENT_PAGE = 50;

/**
 * The operational summary, the availability evidence and the audit trail.
 *
 * Reading is separated from acting by more than a verb here: nothing on this
 * controller can change anything, so the role that opens the console is not the
 * role that reconciles a catalogue. That separation is what lets an analyst be
 * given the portal without being given the database.
 */
@ApiTags('Administration')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly identity: DeploymentIdentity,
    private readonly overview: AdminOverviewService,
    private readonly health: HealthViewRepository,
    private readonly audit: AuditViewRepository,
    private readonly metadata: MetadataViewRepository,
  ) {}

  @Get('overview')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'getAdminOverview', summary: 'Operational summary' })
  async getOverview(@RequestId() requestId: string): Promise<AdminEnvelope<unknown>> {
    const result = await this.overview.describe();
    return envelope(result.data, {
      environmentId: this.identity.environmentId,
      requestId,
      observedAt: result.observedAt,
      evidenceState: result.evidenceState,
    });
  }

  /**
   * Availability split into the four things it is actually made of.
   *
   * A single boolean would have to choose between «the process answers» and
   * «the daily series is current», and choosing either one is how an optional
   * dataset a day behind starts evicting healthy replicas.
   */
  @Get('health/summary')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'getAdminHealthSummary', summary: 'Availability evidence' })
  async getHealth(@RequestId() requestId: string): Promise<AdminEnvelope<unknown>> {
    const [probes, incidents, publications, snapshots] = await Promise.all([
      this.health.probeSummary(AVAILABILITY_WINDOW_HOURS),
      this.health.incidents(INCIDENT_PAGE),
      this.health.publications(),
      this.health.snapshots(),
    ]);
    const observedAt = probes
      .map((probe) => probe.last_observed_at)
      .filter((value): value is Date => value !== null)
      .sort((left, right) => right.getTime() - left.getTime())[0];
    return envelope(
      {
        build: { commit: this.identity.buildCommit, environmentId: this.identity.environmentId },
        probes: probes.map((probe) => ({
          target: probe.target,
          probeType: probe.probe_type,
          lastOutcome: probe.last_outcome ?? 'UNKNOWN',
          lastObservedAt: probe.last_observed_at ? probe.last_observed_at.toISOString() : null,
          checks: Number(probe.checks),
          failedChecks: Number(probe.down_checks),
          unknownChecks: Number(probe.unknown_checks),
        })),
        incidents: incidents.map((incident) => ({
          healthIncidentId: incident.health_incident_id,
          target: incident.target,
          status: incident.status,
          cause: incident.cause,
          consecutiveFailures: incident.consecutive_failures,
          openedAt: incident.opened_at.toISOString(),
          closedAt: incident.closed_at ? incident.closed_at.toISOString() : null,
          durationSeconds: incident.closed_at
            ? Math.round((incident.closed_at.getTime() - incident.opened_at.getTime()) / 1000)
            : null,
          delivery: {
            attempts: Number(incident.deliveries),
            delivered: Number(incident.delivered),
          },
        })),
        publication: publications.map((entry) => ({
          datasetCode: entry.dataset_code,
          status: entry.status,
          sourceCutoffAt: entry.source_cutoff_at ? entry.source_cutoff_at.toISOString() : null,
          lastAttemptAt: entry.last_attempt_at ? entry.last_attempt_at.toISOString() : null,
          lastSuccessAt: entry.last_success_at ? entry.last_success_at.toISOString() : null,
          lastError: entry.last_error,
        })),
        storedCopies: snapshots.map((snapshot) => ({
          name: snapshot.name,
          built: snapshot.built,
        })),
      },
      {
        environmentId: this.identity.environmentId,
        requestId,
        observedAt: observedAt ?? null,
        evidenceState: probes.length ? 'known' : 'unknown',
      },
    );
  }

  @Get('audit/events')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'listAdminAuditEvents', summary: 'Audited actions' })
  async listAudit(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQuery,
    @CurrentActor() actor: Actor,
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const rows = await this.audit.list(query, actor);
    const page = paginate(rows, query.pageSize, (row) => ({
      occurredAt: row.occurred_at.toISOString(),
      identifier: row.audit_log_id,
    }));
    return envelope(
      {
        items: page.items.map((row) => ({
          auditLogId: row.audit_log_id,
          actorSubject: row.actor_subject,
          actorRoles: row.actor_roles.split(',').filter(Boolean),
          action: row.action,
          entityType: row.entity_type,
          entityReference: row.entity_reference,
          outcome: row.outcome,
          correlationId: row.correlation_id,
          details: row.details_json,
          occurredAt: row.occurred_at.toISOString(),
        })),
        nextCursor: page.nextCursor,
      },
      {
        environmentId: this.identity.environmentId,
        requestId,
        observedAt: page.items[0]?.occurred_at ?? null,
        evidenceState: 'known',
      },
    );
  }

  /**
   * One catalogue, named from an allowlist and never from a table name.
   *
   * `references` is the column that decides what the screen may offer: an entry
   * something else points at is protected, and the portal shows a transition
   * instead of an edit.
   */
  @Get('metadata/:catalog')
  @Roles(ACTOR_ROLES.ANALYST, ACTOR_ROLES.METHODOLOGY_STEWARD)
  @ApiOperation({ operationId: 'getAdminMetadataCatalog', summary: 'Read one metadata catalogue' })
  async getCatalog(
    @Param(new ZodValidationPipe(metadataParamsSchema)) params: { catalog: MetadataCatalog },
    @RequestId() requestId: string,
  ): Promise<AdminEnvelope<unknown>> {
    const entries = await this.metadata.read(params.catalog);
    return envelope(
      { catalog: params.catalog, entries },
      {
        environmentId: this.identity.environmentId,
        requestId,
        observedAt: new Date(),
        evidenceState: entries.length ? 'known' : 'unknown',
      },
    );
  }
}
