import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../common/errors/application.error';
import { encodeCursor, paginate } from './admin-cursor';
import type { IngestionRunQuery } from './admin.schemas';
import {
  IngestionStatusRepository,
  type RunRow,
  type SourceStatusRow,
} from './ingestion-status.repository';
import {
  judgeFreshness,
  publicationLagHours,
  type FreshnessVerdict,
} from './source-schedule.policy';

export interface SourceStatus {
  readonly sourceId: string;
  readonly code: string;
  readonly name: string;
  readonly organization: string;
  readonly isActive: boolean;
  readonly cadence: string | null;
  readonly freshness: FreshnessVerdict;
  readonly lastAttemptAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastObservedAt: string | null;
  readonly lastPersistedAt: string | null;
  readonly lastPublishedAt: string | null;
  readonly publicationLagHours: number | null;
  readonly artifactCount: number;
}

function toDate(value: Date | null): Date | null {
  return value ?? null;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function describeSource(row: SourceStatusRow, now: Date): SourceStatus {
  const observation = {
    lastAttemptAt: toDate(row.last_attempt_at),
    lastSuccessAt: toDate(row.last_success_at),
    lastObservedAt: toDate(row.last_observed_at),
    lastPersistedAt: toDate(row.last_persisted_at),
    lastPublishedAt: toDate(row.last_published_at),
  };
  const expectation =
    row.cadence === null || row.tolerance_hours === null
      ? null
      : {
          cadence: row.cadence as 'CONTINUOUS' | 'PERIODIC' | 'HISTORICAL',
          expectedIntervalHours: row.expected_interval_hours,
          toleranceHours: row.tolerance_hours,
          isActive: row.expectation_active ?? true,
        };
  return {
    sourceId: row.source_id,
    code: row.code,
    name: row.name,
    organization: row.organization,
    isActive: row.is_active,
    cadence: row.cadence,
    freshness: judgeFreshness(expectation, observation, now),
    lastAttemptAt: toIso(observation.lastAttemptAt),
    lastSuccessAt: toIso(observation.lastSuccessAt),
    lastObservedAt: toIso(observation.lastObservedAt),
    lastPersistedAt: toIso(observation.lastPersistedAt),
    lastPublishedAt: toIso(observation.lastPublishedAt),
    publicationLagHours: publicationLagHours(observation),
    artifactCount: Number(row.artifact_count),
  };
}

function describeRun(row: RunRow) {
  const received = Number(row.records_received);
  const accepted = Number(row.records_accepted);
  const rejected = Number(row.records_rejected);
  const quarantined = Number(row.records_quarantined);
  return {
    agentRunId: row.agent_run_id,
    sourceCode: row.agent_code,
    sourceName: row.agent_name,
    status: row.status,
    triggerType: row.trigger_type,
    attemptNo: row.attempt_no,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    counters: {
      received,
      accepted,
      rejected,
      quarantined,
      // What the run received and has not yet resolved either way. It is a
      // subtraction and not a stored figure, so it cannot drift from the three
      // above — and a negative result would mean the counters disagree, which
      // is worth showing rather than clamping away.
      unresolved: received - accepted - rejected - quarantined,
    },
    errorSummary: row.error_summary,
    stagesWithProblems: Number(row.stages_pending),
    correlationId: row.correlation_id,
  };
}

/**
 * Turns the ingestion registers into the answers the portal asks for.
 *
 * The policy lives in `source-schedule.policy`, which knows nothing about SQL
 * and is therefore testable against a fixed clock; this service does the
 * shaping and the paging. Keeping the judgement out of the query is what makes
 * «is this source late» a question with one answer everywhere.
 */
@Injectable()
export class IngestionStatusService {
  constructor(private readonly repository: IngestionStatusRepository) {}

  async listSources(now: Date = new Date()): Promise<{
    items: SourceStatus[];
    late: number;
    unknown: number;
    observedAt: string | null;
  }> {
    const rows = await this.repository.listSources();
    const items = rows.map((row) => describeSource(row, now));
    const observed = items
      .map((item) => item.lastSuccessAt)
      .filter((value): value is string => value !== null)
      .sort();
    return {
      items,
      late: items.filter((item) => item.freshness.state === 'late').length,
      unknown: items.filter((item) => item.freshness.state === 'unknown').length,
      observedAt: observed[observed.length - 1] ?? null,
    };
  }

  async listRuns(query: IngestionRunQuery) {
    const rows = await this.repository.listRuns(query);
    const page = paginate(rows, query.pageSize, (row) => ({
      occurredAt: row.started_at.toISOString(),
      identifier: row.agent_run_id,
    }));
    return {
      items: page.items.map(describeRun),
      nextCursor: page.nextCursor,
    };
  }

  async describeRun(agentRunId: string) {
    const row = await this.repository.findRun(agentRunId);
    if (!row) throw new NotFoundError('Agent run', agentRunId);
    const stages = await this.repository.listStages(agentRunId);
    return {
      ...describeRun(row),
      stages: stages.map((stage) => ({
        eventId: stage.ingestion_event_id,
        stage: stage.stage,
        outcome: stage.outcome,
        occurredAt: stage.occurred_at.toISOString(),
        durationMs: stage.duration_ms,
        artifactReference: stage.artifact_reference,
        artifactSha256: stage.artifact_sha256,
        counters: {
          received: Number(stage.records_received),
          accepted: Number(stage.records_accepted),
          rejected: Number(stage.records_rejected),
          skipped: Number(stage.records_skipped),
        },
        reason: stage.reason,
      })),
      /*
       * A run with no recorded stage is not a run that did nothing.
       *
       * The stage register starts when a collector is instrumented, and the
       * runs before that have counters and no stages. Saying so is the whole
       * difference between «we have no evidence» and «nothing happened».
       */
      stagesRecorded: stages.length > 0,
      cursor: encodeCursor({
        occurredAt: row.started_at.toISOString(),
        identifier: row.agent_run_id,
      }),
    };
  }
}
