import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { ReadQueryExecutor } from '../../common/persistence/read-query.executor';

export interface OperationalCountsRow {
  failed_runs: string;
  partial_runs: string;
  running_runs: string;
  dead_letters: string;
  pending_reviews: string;
  open_contradictions: string;
  failed_exports: string;
  generated_exports: string;
  open_incidents: string;
  pending_publications: string;
  last_run_started_at: Date | null;
}

/**
 * The headline counts, over one window, taken at one instant.
 *
 * All of them in a single statement on purpose: the summary and the lists it
 * links to must agree, and eight separate queries taken over a moving register
 * produce a card whose number no listing can reproduce. One statement, one
 * snapshot, one cutoff — and the cutoff travels in the envelope so the screen
 * can say what instant it is describing.
 */
@Injectable()
export class OverviewRepository {
  constructor(private readonly executor: ReadQueryExecutor) {}

  async counts(windowHours: number): Promise<OperationalCountsRow> {
    const rows = await this.executor.run('operations.overview', ({ database, transaction }) =>
      database.query<OperationalCountsRow>(
        `
SELECT
  (SELECT COUNT(*) FROM intelligence.agent_run
    WHERE status = 'FAILED' AND started_at >= now() - make_interval(hours => :windowHours)
  )::text AS failed_runs,
  (SELECT COUNT(*) FROM intelligence.agent_run
    WHERE status = 'PARTIAL' AND started_at >= now() - make_interval(hours => :windowHours)
  )::text AS partial_runs,
  (SELECT COUNT(*) FROM intelligence.agent_run WHERE status = 'RUNNING')::text AS running_runs,
  (SELECT COUNT(*) FROM intelligence.raw_observation
    WHERE processing_status = 'DEAD_LETTER')::text AS dead_letters,
  (SELECT COUNT(*) FROM intelligence.review_task
    WHERE status IN ('PENDING', 'IN_REVIEW'))::text AS pending_reviews,
  (SELECT COUNT(*) FROM intelligence.data_contradiction
    WHERE status IN ('OPEN', 'UNDER_REVIEW'))::text AS open_contradictions,
  (SELECT COUNT(*) FROM operations.export_request
    WHERE status = 'FAILED' AND occurred_at >= now() - make_interval(hours => :windowHours)
  )::text AS failed_exports,
  (SELECT COUNT(*) FROM operations.export_request
    WHERE status = 'GENERATED' AND occurred_at >= now() - make_interval(hours => :windowHours)
  )::text AS generated_exports,
  (SELECT COUNT(*) FROM operations.health_incident WHERE status = 'OPEN')::text AS open_incidents,
  (SELECT COUNT(*) FROM operations.read_model_publication
    WHERE status IN ('PENDING', 'FAILED'))::text AS pending_publications,
  (SELECT MAX(started_at) FROM intelligence.agent_run) AS last_run_started_at
        `,
        { type: QueryTypes.SELECT, transaction, replacements: { windowHours } },
      ),
    );
    return (
      rows[0] ?? {
        failed_runs: '0',
        partial_runs: '0',
        running_runs: '0',
        dead_letters: '0',
        pending_reviews: '0',
        open_contradictions: '0',
        failed_exports: '0',
        generated_exports: '0',
        open_incidents: '0',
        pending_publications: '0',
        last_run_started_at: null,
      }
    );
  }
}
