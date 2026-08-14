/**
 * Stable names shared by every tracing component.
 *
 * They live apart from the code that uses them because a span attribute is a
 * contract with the dashboards and saved searches an operator builds on top of
 * it: renaming one silently breaks queries no test can see.
 */

/** Instrumentation scope reported for every span created by application code. */
export const TRACER_NAME = 'observatorio-economico-core';

/**
 * Application-owned attribute namespace.
 *
 * Only low-cardinality values or internal technical identifiers belong here.
 * Personal data, credentials and agent-authored text are forbidden; see
 * `docs/observability/04-data-privacy-policy.md`.
 */
export const APP_ATTRIBUTES = {
  module: 'app.module',
  operation: 'app.operation',
  entityType: 'app.entity.type',
  entityId: 'app.entity.id',
  organizationId: 'app.organization.id',
  batchSize: 'app.batch.size',
  jobName: 'app.job.name',
  jobAttempt: 'app.job.attempt',
  eventType: 'app.event.type',
  requestId: 'app.request.id',
} as const;

/**
 * Paths excluded from tracing.
 *
 * Docker and NGINX probe the first three every 20-30 seconds; at full sampling
 * they would outnumber real traffic without ever explaining an incident.
 */
export const UNTRACED_PATHS: readonly string[] = [
  '/health',
  '/ready',
  '/metrics',
  '/favicon.ico',
  '/docs',
  '/docs/openapi.json',
];

/** Placeholder written in place of a query string that may carry filters. */
export const REDACTED_VALUE = '<redacted>';
