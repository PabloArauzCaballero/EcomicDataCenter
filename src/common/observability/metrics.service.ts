import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

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

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'observatory_' });
  }

  observeRequest(method: string, route: string, statusCode: number, durationMs: number): void {
    const labels = { method, route, status_code: String(statusCode) };
    this.requestCount.inc(labels);
    this.requestDuration.observe(labels, durationMs / 1_000);
  }

  observeDatabaseOperation(operation: string, outcome: 'success' | 'error', durationMs: number): void {
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
