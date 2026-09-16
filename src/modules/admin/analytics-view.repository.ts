import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { ReadQueryExecutor } from '../../common/persistence/read-query.executor';
import { decodeCursor } from './admin-cursor';
import type { ExportQuery, TrafficQuery } from './admin.schemas';

export interface TrafficBucketRow {
  bucket: Date;
  route: string;
  event_kind: string;
  device_category: string;
  referrer_category: string;
  views: string;
  visitors: string;
}

export interface TrafficCoverageRow {
  first_event_at: Date | null;
  last_event_at: Date | null;
  total_events: string;
  robot_events: string;
}

export interface ExportRow {
  export_request_id: string;
  request_id: string;
  dataset_code: string;
  export_format: string;
  status: string;
  filters_json: Record<string, unknown>;
  row_count: string | null;
  byte_count: string | null;
  duration_ms: number | null;
  truncated: boolean;
  occurred_at: Date;
  error_code: string | null;
}

/**
 * Reads the traffic and export registers, always with their coverage.
 *
 * Every figure here is answerable only for the window the register actually
 * covers, and the coverage row is returned with the counts rather than left for
 * the caller to remember. A receiver that has been down since Tuesday produces
 * zero page views for Wednesday, and the only thing that stops that from
 * reading as «nobody visited» is knowing when the last event arrived.
 */
@Injectable()
export class AnalyticsViewRepository {
  constructor(private readonly executor: ReadQueryExecutor) {}

  async traffic(query: TrafficQuery): Promise<TrafficBucketRow[]> {
    return this.executor.run('operations.traffic_buckets', ({ database, transaction }) =>
      database.query<TrafficBucketRow>(
        `
SELECT
  date_trunc(:granularity, occurred_at) AS bucket,
  route,
  event_kind,
  device_category,
  referrer_category,
  COUNT(*)::text AS views,
  COUNT(DISTINCT visitor_bucket)::text AS visitors
FROM operations.traffic_event
WHERE is_robot = false
  AND (:since::timestamptz IS NULL OR occurred_at >= :since)
  AND (:until::timestamptz IS NULL OR occurred_at < :until)
GROUP BY 1, 2, 3, 4, 5
ORDER BY 1 DESC, views DESC
LIMIT 2000
        `,
        {
          type: QueryTypes.SELECT,
          transaction,
          replacements: {
            granularity: query.granularity,
            since: query.since ?? null,
            until: query.until ?? null,
          },
        },
      ),
    );
  }

  /** When measurement started and stopped, and how much of it was robots. */
  async trafficCoverage(): Promise<TrafficCoverageRow> {
    const rows = await this.executor.run(
      'operations.traffic_coverage',
      ({ database, transaction }) =>
        database.query<TrafficCoverageRow>(
          `
SELECT
  MIN(occurred_at) AS first_event_at,
  MAX(occurred_at) AS last_event_at,
  COUNT(*)::text AS total_events,
  COUNT(*) FILTER (WHERE is_robot)::text AS robot_events
FROM operations.traffic_event
          `,
          { type: QueryTypes.SELECT, transaction },
        ),
    );
    return (
      rows[0] ?? {
        first_event_at: null,
        last_event_at: null,
        total_events: '0',
        robot_events: '0',
      }
    );
  }

  async exports(query: ExportQuery): Promise<ExportRow[]> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    return this.executor.run('operations.export_requests', ({ database, transaction }) =>
      database.query<ExportRow>(
        `
SELECT
  export_request_id::text AS export_request_id, request_id, dataset_code, export_format,
  status, filters_json, row_count::text AS row_count, byte_count::text AS byte_count,
  duration_ms, truncated, occurred_at, error_code
FROM operations.export_request
WHERE (:datasetCode::varchar IS NULL OR dataset_code = :datasetCode)
  AND (:status::varchar IS NULL OR status = :status)
  AND (:since::timestamptz IS NULL OR occurred_at >= :since)
  AND (:until::timestamptz IS NULL OR occurred_at < :until)
  AND (
    :cursorAt::timestamptz IS NULL
    OR (occurred_at, export_request_id) < (:cursorAt::timestamptz, :cursorId::bigint)
  )
ORDER BY occurred_at DESC, export_request_id DESC
LIMIT :limit
        `,
        {
          type: QueryTypes.SELECT,
          transaction,
          replacements: {
            datasetCode: query.datasetCode ?? null,
            status: query.status ?? null,
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

  /**
   * Generation and failure by dataset, kept apart from intention.
   *
   * A click is an intention and a `Response` is a generation; neither is a
   * completed transfer, and the register refuses to add them up. Whatever is
   * not measured is absent here rather than estimated.
   */
  async exportSummary(): Promise<
    Array<{ dataset_code: string; status: string; requests: string; rows: string | null }>
  > {
    return this.executor.run('operations.export_summary', ({ database, transaction }) =>
      database.query<{
        dataset_code: string;
        status: string;
        requests: string;
        rows: string | null;
      }>(
        `
SELECT dataset_code, status, COUNT(*)::text AS requests, SUM(row_count)::text AS rows
FROM operations.export_request
GROUP BY dataset_code, status
ORDER BY dataset_code, status
        `,
        { type: QueryTypes.SELECT, transaction },
      ),
    );
  }
}
