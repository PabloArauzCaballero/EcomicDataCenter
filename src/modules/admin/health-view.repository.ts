import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { ReadQueryExecutor } from '../../common/persistence/read-query.executor';

export interface ProbeSummaryRow {
  target: string;
  probe_type: string;
  last_observed_at: Date | null;
  last_outcome: string | null;
  checks: string;
  down_checks: string;
  unknown_checks: string;
}

export interface IncidentRow {
  health_incident_id: string;
  target: string;
  status: string;
  cause: string;
  consecutive_failures: number;
  opened_at: Date;
  closed_at: Date | null;
  deliveries: string;
  delivered: string;
}

export interface PublicationRow {
  dataset_code: string;
  status: string;
  source_cutoff_at: Date | null;
  last_attempt_at: Date | null;
  last_success_at: Date | null;
  last_error: string | null;
}

export interface SnapshotRow {
  name: string;
  built: boolean;
}

/**
 * Reads the evidence of availability, keeping its four kinds apart.
 *
 * A process being alive, its dependencies answering, the obligatory catalogues
 * being present and a dataset being current are four different questions, and
 * the only reason they were ever one endpoint is that one endpoint was easier
 * to write. Answering them separately is what keeps an optional dataset that is
 * a day behind from evicting every replica.
 */
@Injectable()
export class HealthViewRepository {
  constructor(private readonly executor: ReadQueryExecutor) {}

  async probeSummary(sinceHours: number): Promise<ProbeSummaryRow[]> {
    return this.executor.run('operations.health_probes', ({ database, transaction }) =>
      database.query<ProbeSummaryRow>(
        `
SELECT
  target,
  probe_type,
  MAX(observed_at) AS last_observed_at,
  (ARRAY_AGG(outcome ORDER BY observed_at DESC))[1] AS last_outcome,
  COUNT(*)::text AS checks,
  COUNT(*) FILTER (WHERE outcome = 'DOWN')::text AS down_checks,
  COUNT(*) FILTER (WHERE outcome = 'UNKNOWN')::text AS unknown_checks
FROM operations.health_probe
WHERE observed_at >= now() - make_interval(hours => :sinceHours)
GROUP BY target, probe_type
ORDER BY target
        `,
        { type: QueryTypes.SELECT, transaction, replacements: { sinceHours } },
      ),
    );
  }

  async incidents(limit: number): Promise<IncidentRow[]> {
    return this.executor.run('operations.health_incidents', ({ database, transaction }) =>
      database.query<IncidentRow>(
        `
SELECT
  incident.health_incident_id, incident.target, incident.status, incident.cause,
  incident.consecutive_failures, incident.opened_at, incident.closed_at,
  COALESCE(delivery.total, 0)::text AS deliveries,
  COALESCE(delivery.delivered, 0)::text AS delivered
FROM operations.health_incident incident
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered
    FROM operations.alert_delivery alert
   WHERE alert.health_incident_id = incident.health_incident_id
) delivery ON TRUE
ORDER BY incident.opened_at DESC
LIMIT :limit
        `,
        { type: QueryTypes.SELECT, transaction, replacements: { limit } },
      ),
    );
  }

  async publications(): Promise<PublicationRow[]> {
    return this.executor.run('operations.publications', ({ database, transaction }) =>
      database.query<PublicationRow>(
        `
SELECT dataset_code, status, source_cutoff_at, last_attempt_at, last_success_at, last_error
FROM operations.read_model_publication
ORDER BY dataset_code
        `,
        { type: QueryTypes.SELECT, transaction },
      ),
    );
  }

  /**
   * Which stored copies exist and which have ever been filled.
   *
   * `relispopulated` is the server's own answer and the only reliable one: a
   * copy created `WITH NO DATA` raises on any read, while a built copy that is
   * simply empty returns no rows, and counting cannot tell the two apart.
   */
  async snapshots(): Promise<SnapshotRow[]> {
    return this.executor.run('operations.snapshot_state', ({ database, transaction }) =>
      database.query<SnapshotRow>(
        `
SELECT class.relname AS name, class.relispopulated AS built
  FROM pg_catalog.pg_class class
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
 WHERE namespace.nspname = 'read_models' AND class.relkind = 'm'
 ORDER BY class.relname
        `,
        { type: QueryTypes.SELECT, transaction },
      ),
    );
  }
}
