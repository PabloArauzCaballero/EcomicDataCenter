import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { ReadQueryExecutor } from '../../common/persistence/read-query.executor';
import { decodeCursor, type ListCursor } from './admin-cursor';
import type { IngestionRunQuery } from './admin.schemas';

export interface SourceStatusRow {
  source_id: string;
  code: string;
  name: string;
  is_active: boolean;
  organization: string;
  cadence: string | null;
  expected_interval_hours: number | null;
  tolerance_hours: number | null;
  time_zone: string | null;
  expectation_active: boolean | null;
  last_attempt_at: Date | null;
  last_success_at: Date | null;
  last_observed_at: Date | null;
  last_persisted_at: Date | null;
  last_published_at: Date | null;
  artifact_count: string;
}

export interface RunRow {
  agent_run_id: string;
  agent_code: string;
  agent_name: string;
  status: string;
  trigger_type: string;
  attempt_no: number;
  started_at: Date;
  completed_at: Date | null;
  records_received: string;
  records_accepted: string;
  records_rejected: string;
  records_quarantined: string;
  error_summary: string | null;
  correlation_id: string;
  stages_pending: string;
}

export interface StageRow {
  ingestion_event_id: string;
  stage: string;
  outcome: string;
  occurred_at: Date;
  duration_ms: number | null;
  artifact_reference: string | null;
  artifact_sha256: string | null;
  records_received: string;
  records_accepted: string;
  records_rejected: string;
  records_skipped: string;
  reason: string | null;
}

/**
 * Serves ingestion state from the reader, correlated across its stages.
 *
 * The instants a source is judged by come from two registers and are kept
 * apart on purpose. `provenance.source_artifact` is the evidence that the
 * collector actually reached the source — an artifact only exists because a
 * fetch succeeded — and it predates this portal, so history is not lost.
 * `operations.ingestion_event` is what the stages after that write down. A
 * source with artifacts and no events is not broken; it is a source whose
 * collector has not been instrumented yet, and the difference is visible
 * rather than rendered as silence.
 */
@Injectable()
export class IngestionStatusRepository {
  constructor(private readonly executor: ReadQueryExecutor) {}

  async listSources(): Promise<SourceStatusRow[]> {
    return this.executor.run('operations.ingestion_sources', ({ database, transaction }) =>
      database.query<SourceStatusRow>(
        `
SELECT
  source.source_id,
  source.code,
  source.name,
  source.is_active,
  organization.short_name AS organization,
  expectation.cadence,
  expectation.expected_interval_hours,
  expectation.tolerance_hours,
  expectation.time_zone,
  expectation.is_active AS expectation_active,
  GREATEST(artifacts.last_retrieved_at, events.last_attempt_at) AS last_attempt_at,
  GREATEST(artifacts.last_retrieved_at, events.last_success_at) AS last_success_at,
  artifacts.last_retrieved_at AS last_observed_at,
  events.last_persisted_at,
  events.last_published_at,
  COALESCE(artifacts.artifact_count, 0)::text AS artifact_count
FROM provenance.source source
JOIN provenance.organization organization
  ON organization.organization_id = source.organization_id
LEFT JOIN operations.source_expectation expectation
  ON expectation.source_id = source.source_id
LEFT JOIN LATERAL (
  SELECT MAX(artifact.retrieved_at) AS last_retrieved_at, COUNT(*) AS artifact_count
    FROM provenance.source_artifact artifact
   WHERE artifact.source_id = source.source_id
) artifacts ON TRUE
LEFT JOIN LATERAL (
  SELECT
    MAX(event.occurred_at) AS last_attempt_at,
    MAX(event.occurred_at) FILTER (
      WHERE event.outcome IN ('SUCCEEDED', 'PARTIAL', 'NO_CHANGES')
    ) AS last_success_at,
    MAX(event.occurred_at) FILTER (
      WHERE event.stage = 'PERSISTENCE' AND event.outcome IN ('SUCCEEDED', 'PARTIAL')
    ) AS last_persisted_at,
    MAX(event.occurred_at) FILTER (
      WHERE event.stage = 'PUBLICATION' AND event.outcome = 'SUCCEEDED'
    ) AS last_published_at
    FROM operations.ingestion_event event
   WHERE event.source_id = source.source_id
) events ON TRUE
ORDER BY source.code
        `,
        { type: QueryTypes.SELECT, transaction },
      ),
    );
  }

  /**
   * One page of collection runs, newest first, with the stages still open.
   *
   * `stages_pending` counts the stages an operator would be waiting on, which
   * is what turns «the run succeeded» into a claim that can be contradicted:
   * a run that collected and never delivered is a success with a pending
   * stage, not a success.
   */
  async listRuns(query: IngestionRunQuery): Promise<RunRow[]> {
    const cursor: ListCursor | null = query.cursor ? decodeCursor(query.cursor) : null;
    return this.executor.run('operations.ingestion_runs', ({ database, transaction }) =>
      database.query<RunRow>(
        `
SELECT
  run.agent_run_id,
  agent.code AS agent_code,
  agent.name AS agent_name,
  run.status,
  run.trigger_type,
  run.attempt_no,
  run.started_at,
  run.completed_at,
  run.records_received,
  run.records_accepted,
  run.records_rejected,
  run.records_quarantined,
  run.error_summary,
  run.correlation_id,
  COALESCE(stages.pending, 0)::text AS stages_pending
FROM intelligence.agent_run run
JOIN intelligence.ai_agent agent ON agent.ai_agent_id = run.ai_agent_id
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS pending
    FROM operations.ingestion_event event
   WHERE event.agent_run_id = run.agent_run_id
     AND event.outcome IN ('PARTIAL', 'FAILED')
) stages ON TRUE
WHERE (:sourceCode::varchar IS NULL OR agent.code = :sourceCode)
  AND (:status::varchar IS NULL OR run.status = :status)
  AND (:since::timestamptz IS NULL OR run.started_at >= :since)
  AND (:until::timestamptz IS NULL OR run.started_at < :until)
  AND (
    :cursorAt::timestamptz IS NULL
    OR (run.started_at, run.agent_run_id) < (:cursorAt::timestamptz, :cursorId::uuid)
  )
  AND (
    :stage::varchar IS NULL
    OR EXISTS (
      SELECT 1 FROM operations.ingestion_event event
       WHERE event.agent_run_id = run.agent_run_id AND event.stage = :stage
    )
  )
ORDER BY run.started_at DESC, run.agent_run_id DESC
LIMIT :limit
        `,
        {
          type: QueryTypes.SELECT,
          transaction,
          replacements: {
            sourceCode: query.sourceCode ?? null,
            status: query.status ?? null,
            stage: query.stage ?? null,
            since: query.since ?? null,
            until: query.until ?? null,
            cursorAt: cursor?.occurredAt ?? null,
            cursorId: cursor?.identifier ?? null,
            limit: query.pageSize + 1,
          },
        },
      ),
    );
  }

  async findRun(agentRunId: string): Promise<RunRow | null> {
    const rows = await this.executor.run('operations.ingestion_run', ({ database, transaction }) =>
      database.query<RunRow>(
        `
SELECT
  run.agent_run_id, agent.code AS agent_code, agent.name AS agent_name, run.status,
  run.trigger_type, run.attempt_no, run.started_at, run.completed_at,
  run.records_received, run.records_accepted, run.records_rejected,
  run.records_quarantined, run.error_summary, run.correlation_id,
  '0'::text AS stages_pending
FROM intelligence.agent_run run
JOIN intelligence.ai_agent agent ON agent.ai_agent_id = run.ai_agent_id
WHERE run.agent_run_id = :agentRunId
        `,
        { type: QueryTypes.SELECT, transaction, replacements: { agentRunId } },
      ),
    );
    return rows[0] ?? null;
  }

  async listStages(agentRunId: string): Promise<StageRow[]> {
    return this.executor.run('operations.ingestion_stages', ({ database, transaction }) =>
      database.query<StageRow>(
        `
SELECT
  ingestion_event_id::text AS ingestion_event_id, stage, outcome, occurred_at, duration_ms,
  artifact_reference, artifact_sha256, records_received, records_accepted,
  records_rejected, records_skipped, reason
FROM operations.ingestion_event
WHERE agent_run_id = :agentRunId
ORDER BY occurred_at, ingestion_event_id
        `,
        { type: QueryTypes.SELECT, transaction, replacements: { agentRunId } },
      ),
    );
  }
}
