import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly requestCount = new Counter({
    name: 'observatory_http_requests_total',
    help: 'Total HTTP requests processed by normalized route.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });
  private readonly requestDuration = new Histogram({
    name: 'observatory_http_request_duration_seconds',
    help: 'HTTP request duration in seconds.',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });
  private readonly ingestionRecords = new Counter({
    name: 'observatory_ingestion_records_total',
    help: 'Ingestion record outcomes by stable mode and outcome.',
    labelNames: ['mode', 'outcome'] as const,
    registers: [this.registry],
  });
  private readonly databaseDuration = new Histogram({
    name: 'observatory_database_operation_duration_seconds',
    help: 'Database operation duration by stable operation name and outcome.',
    labelNames: ['operation', 'outcome'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  private readonly auditEntries = new Counter({
    name: 'observatory_audit_entries_total',
    help: 'Audit trail writes by action outcome and persistence result. "committed" means the entry shares the transaction of the change it describes.',
    labelNames: ['outcome', 'result'] as const,
    registers: [this.registry],
  });
  private readonly intelligenceRecords = new Counter({
    name: 'observatory_intelligence_records_total',
    help: 'Agent submission outcomes by stage and outcome.',
    labelNames: ['stage', 'outcome'] as const,
    registers: [this.registry],
  });
  private readonly openContradictions = new Gauge({
    name: 'observatory_open_contradictions',
    help: 'Contradictions awaiting analyst resolution.',
    registers: [this.registry],
  });
  private readonly pendingReviews = new Gauge({
    name: 'observatory_pending_review_tasks',
    help: 'Review tasks awaiting a human decision.',
    registers: [this.registry],
  });
  private readonly deadLetters = new Gauge({
    name: 'observatory_dead_letter_items',
    help: 'Agent items that exhausted their reprocessing attempts.',
    registers: [this.registry],
  });
  private readonly staleSources = new Gauge({
    name: 'observatory_stale_sources',
    help: 'Active sources with no artifact retrieved in the last 48 hours.',
    registers: [this.registry],
  });
  private readonly ingestionLag = new Gauge({
    name: 'observatory_ingestion_lag_seconds',
    help: 'Seconds since the most recent agent submission was received.',
    registers: [this.registry],
  });
  private readonly databasePool = new Gauge({
    name: 'observatory_database_pool_connections',
    help: 'Database connection pool utilization by role and state (total, idle, in_use, waiting).',
    labelNames: ['role', 'state'] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'observatory_' });
  }

  observeAudit(outcome: 'SUCCESS' | 'FAILURE', result: 'committed' | 'recorded' | 'dropped'): void {
    this.auditEntries.inc({ outcome, result });
  }

  observeIntelligence(
    stage: 'raw' | 'claim' | 'contradiction' | 'review',
    outcome: 'accepted' | 'duplicate' | 'quarantined' | 'rejected' | 'opened' | 'resolved',
    count = 1,
  ): void {
    this.intelligenceRecords.inc({ stage, outcome }, count);
  }

  setOpenContradictions(value: number): void {
    this.openContradictions.set(value);
  }

  setPendingReviewTasks(value: number): void {
    this.pendingReviews.set(value);
  }

  setDeadLetters(value: number): void {
    this.deadLetters.set(value);
  }

  setStaleSources(value: number): void {
    this.staleSources.set(value);
  }

  setIngestionLagSeconds(value: number): void {
    this.ingestionLag.set(value);
  }

  /**
   * Publishes pool saturation so an operator can see connection exhaustion —
   * the most likely production stall — instead of inferring it from latency.
   */
  setDatabasePool(
    role: 'reader' | 'writer',
    counts: { total: number; idle: number; inUse: number; waiting: number },
  ): void {
    this.databasePool.set({ role, state: 'total' }, counts.total);
    this.databasePool.set({ role, state: 'idle' }, counts.idle);
    this.databasePool.set({ role, state: 'in_use' }, counts.inUse);
    this.databasePool.set({ role, state: 'waiting' }, counts.waiting);
  }

  observeRequest(method: string, route: string, statusCode: number, durationMs: number): void {
    const labels = { method, route, status_code: String(statusCode) };
    this.requestCount.inc(labels);
    this.requestDuration.observe(labels, durationMs / 1_000);
  }

  observeDatabaseOperation(
    operation: string,
    outcome: 'success' | 'error',
    durationMs: number,
  ): void {
    this.databaseDuration.observe({ operation, outcome }, durationMs / 1_000);
  }

  observeIngestion(
    mode: 'single' | 'batch',
    outcome: 'PUBLISHED' | 'REJECTED' | 'UNCHANGED' | 'INVALID',
    count = 1,
  ): void {
    this.ingestionRecords.inc({ mode, outcome }, count);
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
