import type { Span } from '@opentelemetry/api';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { ATTR_URL_FULL, ATTR_URL_QUERY } from '@opentelemetry/semantic-conventions';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { fastifyTracingInstrumentation } from './fastify-tracing.plugin';
import { REDACTED_VALUE } from './telemetry.constants';
import { isUntracedTarget, redactQueryString, redactUrlCredentials } from './telemetry.redaction';

/**
 * Strips request values from the URL attributes of an HTTP span.
 *
 * The path identifies the operation; the query string carries filter values
 * that can be confidential, and an outbound URL can embed credentials. Both are
 * rewritten before the span reaches the exporter.
 */
function redactHttpTarget(span: Span, request: ClientRequest | IncomingMessage): void {
  if ('path' in request) {
    const url = `${request.protocol}//${request.host}${request.path}`;
    span.setAttribute(ATTR_URL_FULL, redactUrlCredentials(redactQueryString(url) ?? url));
    if (request.path.includes('?')) span.setAttribute(ATTR_URL_QUERY, REDACTED_VALUE);
    return;
  }
  if (request.url?.includes('?')) span.setAttribute(ATTR_URL_QUERY, REDACTED_VALUE);
}

/**
 * Builds the instrumentation set for the technologies this backend actually
 * uses. Nothing here is speculative: adding a technology means adding its
 * instrumentation here, deliberately, in the same change.
 */
export function createInstrumentations() {
  return [
    new HttpInstrumentation({
      // Suppressing the probe at the hook avoids even creating the span, so an
      // excluded endpoint costs nothing rather than being created and dropped.
      ignoreIncomingRequestHook: (request) => isUntracedTarget(request.url),
      requestHook: redactHttpTarget,
    }),
    // Registered explicitly on the server in `main.ts`; see the plugin module
    // for why implicit registration is avoided.
    fastifyTracingInstrumentation(),
    new NestInstrumentation(),
    new PgInstrumentation({
      // Bound parameter values may hold confidential filters and identifiers;
      // the statement text alone is enough to identify a slow query.
      enhancedDatabaseReporting: false,
      // Startup authentication and shutdown probes run outside any request. A
      // parentless query span would be an orphan trace with no operation to
      // explain it, so those are left untraced on purpose.
      requireParentSpan: true,
    }),
    new PinoInstrumentation({
      // Pino stays the log system (ADR-0006): only trace identifiers are
      // injected. Shipping log records through OpenTelemetry as well would
      // duplicate every line.
      disableLogSending: true,
      disableLogCorrelation: false,
    }),
  ];
}
