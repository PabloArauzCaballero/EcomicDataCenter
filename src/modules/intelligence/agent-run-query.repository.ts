import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { NotFoundError } from '../../common/errors/application.error';
import { ReadQueryExecutor } from '../../common/persistence/read-query.executor';
import type { AgentRunStatus } from './intelligence-results';

interface AgentRunStatusRow {
  agent_run_id: string;
  agent_code: string;
  organization_id: string;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  records_received: string;
  records_accepted: string;
  records_rejected: string;
  records_quarantined: string;
  correlation_id: string;
}

/** Run progress an agent polls, including the owner needed to scope the read. */
export interface ScopedAgentRunStatus {
  readonly status: AgentRunStatus;
  readonly organizationId: string;
}

/**
 * Serves run progress from the reader pool.
 *
 * Polling progress is a read: routing it through the writer would spend a
 * bounded write connection and take a SERIALIZABLE snapshot for a GET, so a
 * fleet of agents checking on themselves would compete with the ingestion they
 * are reporting on. Migration 0025 grants the reader SELECT on both tables.
 */
@Injectable()
export class AgentRunQueryRepository {
  constructor(private readonly executor: ReadQueryExecutor) {}

  async requireStatus(agentRunId: string): Promise<ScopedAgentRunStatus> {
    const rows = await this.executor.run(
      'intelligence.agent_run_status',
      ({ database, transaction }) =>
        database.query<AgentRunStatusRow>(
          `
SELECT
  run.agent_run_id,
  agent.code AS agent_code,
  agent.organization_id,
  run.status,
  run.started_at,
  run.completed_at,
  run.records_received,
  run.records_accepted,
  run.records_rejected,
  run.records_quarantined,
  run.correlation_id
FROM intelligence.agent_run run
JOIN intelligence.ai_agent agent ON agent.ai_agent_id = run.ai_agent_id
WHERE run.agent_run_id = :agentRunId
        `,
          { replacements: { agentRunId }, type: QueryTypes.SELECT, transaction },
        ),
    );
    const row = rows[0];
    if (!row) throw new NotFoundError('agent_run', agentRunId);
    return {
      organizationId: row.organization_id,
      status: {
        agentRunId: row.agent_run_id,
        agentCode: row.agent_code,
        status: row.status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        recordsReceived: row.records_received,
        recordsAccepted: row.records_accepted,
        recordsRejected: row.records_rejected,
        recordsQuarantined: row.records_quarantined,
        correlationId: row.correlation_id,
      },
    };
  }
}
