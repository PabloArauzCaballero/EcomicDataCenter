import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { QueryTypes } from 'sequelize';
import { toSafeErrorLog } from '../errors/error-logging';
import { ReadQueryExecutor } from '../persistence/read-query.executor';
import { MetricsService } from './metrics.service';
import { APP_ATTRIBUTES } from './telemetry.constants';
import { TracingService } from './tracing.service';

const COLLECTION_INTERVAL_MS = 60_000;

interface DomainCountsRow {
  open_contradictions: string;
  pending_reviews: string;
  dead_letters: string;
  stale_sources: string;
  ingestion_lag_seconds: string | null;
}

/**
 * Publishes the operational state of the datacenter as gauges.
 *
 * These answer questions a dashboard must answer without a person querying the
 * database: how much contradictory information is unresolved, how much work is
 * waiting on a reviewer, and how far behind the most recent ingestion is.
 */
@Injectable()
export class DomainMetricsCollector implements OnModuleInit, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    private readonly executor: ReadQueryExecutor,
    private readonly metrics: MetricsService,
    private readonly logger: PinoLogger,
    private readonly tracing: TracingService,
  ) {}

  onModuleInit(): void {
    // Collect once at start so the gauges reflect real backlog immediately;
    // otherwise every gauge reads a false 0 until the first interval fires,
    // masking a backlog exactly when a fresh instance is least trustworthy.
    void this.collect();
    // `unref` keeps this timer from holding the event loop open, so a shutdown
    // signal is honoured immediately instead of waiting for the next tick.
    this.timer = setInterval(() => void this.collect(), COLLECTION_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Reads the current counts and publishes them; failures never propagate. */
  async collect(): Promise<void> {
    if (this.stopped) return;
    // Scheduled work has no incoming request to inherit from. A root span keeps
    // the collection in its own trace instead of grafting a background job onto
    // whichever request happened to be in flight.
    await this.tracing.runInRootSpan(
      'scheduler.domain-metrics',
      {
        [APP_ATTRIBUTES.module]: 'observability',
        [APP_ATTRIBUTES.operation]: 'collect-domain-metrics',
        [APP_ATTRIBUTES.jobName]: 'domain-metrics',
      },
      () => this.publishCounts(),
    );
  }

  private async publishCounts(): Promise<void> {
    try {
      const rows = await this.executor.run(
        'observability.domain_counts',
        ({ database, transaction }) =>
          database.query<DomainCountsRow>(
            `
SELECT
  (SELECT COUNT(*) FROM intelligence.data_contradiction
     WHERE status IN ('OPEN','UNDER_REVIEW')) AS open_contradictions,
  (SELECT COUNT(*) FROM intelligence.review_task
     WHERE status IN ('PENDING','IN_REVIEW')) AS pending_reviews,
  (SELECT COUNT(*) FROM intelligence.raw_observation
     WHERE processing_status = 'DEAD_LETTER') AS dead_letters,
  (SELECT COUNT(*) FROM provenance.source source
     WHERE source.is_active
       AND NOT EXISTS (
         SELECT 1 FROM provenance.source_artifact artifact
         WHERE artifact.source_id = source.source_id
           AND artifact.retrieved_at > now() - interval '48 hours'
       )) AS stale_sources,
  (SELECT EXTRACT(EPOCH FROM (now() - MAX(received_at)))
     FROM intelligence.raw_observation) AS ingestion_lag_seconds
          `,
            { type: QueryTypes.SELECT, transaction },
          ),
      );
      const row = rows[0];
      if (!row) return;
      this.metrics.setOpenContradictions(Number(row.open_contradictions));
      this.metrics.setPendingReviewTasks(Number(row.pending_reviews));
      this.metrics.setDeadLetters(Number(row.dead_letters));
      this.metrics.setStaleSources(Number(row.stale_sources));
      if (row.ingestion_lag_seconds !== null) {
        this.metrics.setIngestionLagSeconds(Number(row.ingestion_lag_seconds));
      }
    } catch (error) {
      // Nest does not guarantee shutdown ordering, so a collection already in
      // flight can outlive the connection pools. Reporting that as a failure
      // would make every clean shutdown look like an incident.
      if (this.stopped) return;
      // The failure is swallowed for the caller but must still be visible in the
      // trace: otherwise a job that never publishes a gauge looks successful.
      this.tracing.recordException(error);
      // This best-effort path must never throw: the contract-export build boots
      // the module with no logger and a database double, and the initial collect
      // would otherwise crash it. Optional chaining keeps telemetry loss silent
      // where a logger is genuinely absent.
      this.logger?.warn({ error: toSafeErrorLog(error) }, 'Domain metric collection failed');
    }
  }
}
