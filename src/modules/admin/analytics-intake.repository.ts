import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize } from 'sequelize';
import { ENVIRONMENT } from '../../config/configuration.module';
import type { Environment } from '../../config/environment';
import { WRITER_DATABASE } from '../../database/database.tokens';
import type { ExportEvent, TrafficBatch } from './analytics.schemas';

/**
 * Stores what the public site reports about itself.
 *
 * Deduplication is a unique key on the event identifier and `DO NOTHING`, not a
 * check-then-insert: the page retries a delivery it is not sure landed, and two
 * concurrent retries must not both count. The insert reports how many rows were
 * actually new, so the caller can say «accepted 12, already had 3» instead of
 * claiming fifteen fresh visits.
 *
 * Retention is enforced on write. There is no scheduler to hang it on and this
 * project does not add one; a bounded delete on an indexed column, run when
 * events arrive, keeps the register inside its declared window without
 * introducing infrastructure whose only job is to delete rows.
 */
@Injectable()
export class AnalyticsIntakeRepository {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  async recordTraffic(batch: TrafficBatch): Promise<{ accepted: number; duplicates: number }> {
    const rows = await this.writer.query<{ event_key: string }>(
      `INSERT INTO operations.traffic_event (
         event_key, occurred_at, route, event_kind, device_category,
         referrer_category, visitor_bucket, is_robot
       )
       SELECT
         entry.event_key, entry.occurred_at::timestamptz, entry.route, entry.event_kind,
         entry.device_category, entry.referrer_category, entry.visitor_bucket, entry.is_robot
       FROM jsonb_to_recordset(CAST(:events AS jsonb)) AS entry(
         event_key varchar(64), occurred_at text, route varchar(200), event_kind varchar(20),
         device_category varchar(20), referrer_category varchar(20),
         visitor_bucket char(16), is_robot boolean
       )
       ON CONFLICT (event_key) DO NOTHING
       RETURNING event_key`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          events: JSON.stringify(
            batch.events.map((event) => ({
              event_key: event.eventId,
              occurred_at: event.occurredAt,
              route: event.route,
              event_kind: event.kind,
              device_category: event.device,
              referrer_category: event.referrer,
              visitor_bucket: event.visitorBucket,
              is_robot: event.isRobot,
            })),
          ),
        },
      },
    );
    await this.prune();
    return { accepted: rows.length, duplicates: batch.events.length - rows.length };
  }

  /**
   * Records one stage of one export.
   *
   * The unique key is the pair (request, status), so the same stage reported
   * twice is one row and the two stages of one export are two. An export that
   * was requested and never generated is then a gap the register shows.
   */
  async recordExport(event: ExportEvent): Promise<void> {
    await this.writer.query(
      `INSERT INTO operations.export_request (
         request_id, dataset_code, export_format, status, filters_json,
         row_count, byte_count, duration_ms, truncated, occurred_at, error_code
       ) VALUES (
         :requestId, :datasetCode, :format, :status, CAST(:filters AS jsonb),
         :rowCount, :byteCount, :durationMs, :truncated, now(), :errorCode
       )
       ON CONFLICT ON CONSTRAINT uq_export_request_stage DO NOTHING`,
      {
        type: QueryTypes.INSERT,
        replacements: {
          requestId: event.requestId,
          datasetCode: event.datasetCode,
          format: event.format,
          status: event.status,
          filters: JSON.stringify(event.filters),
          rowCount: event.rowCount ?? null,
          byteCount: event.byteCount ?? null,
          durationMs: event.durationMs ?? null,
          truncated: event.truncated,
          errorCode: event.errorCode ?? null,
        },
      },
    );
  }

  private async prune(): Promise<void> {
    await this.writer.query(
      `DELETE FROM operations.traffic_event
        WHERE traffic_event_id IN (
          SELECT traffic_event_id FROM operations.traffic_event
           WHERE occurred_at < now() - make_interval(days => :days)
           LIMIT 500
        )`,
      {
        type: QueryTypes.DELETE,
        replacements: { days: this.environment.ANALYTICS_RETENTION_DAYS },
      },
    );
  }
}
