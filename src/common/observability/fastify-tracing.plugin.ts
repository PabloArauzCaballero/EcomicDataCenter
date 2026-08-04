import FastifyOtelInstrumentation from '@fastify/otel';
import { ATTR_URL_PATH } from '@opentelemetry/semantic-conventions';
import { isUntracedTarget, redactQueryString } from './telemetry.redaction';

let instrumentation: FastifyOtelInstrumentation | undefined;

/**
 * The Fastify tracing instrumentation, created once per process.
 *
 * `@fastify/otel` is the official successor of the deprecated
 * `@opentelemetry/instrumentation-fastify`. It is deliberately **not**
 * configured with `registerOnInitialization`: that mode subscribes to a
 * diagnostics channel and injects itself into every Fastify instance created
 * afterwards, an implicit global side effect that double-registers the plugin
 * when more than one server is built in a process. Registering the plugin
 * explicitly, next to helmet and rate-limit in `main.ts`, keeps the wiring
 * visible and deterministic.
 */
export function fastifyTracingInstrumentation(): FastifyOtelInstrumentation {
  instrumentation ??= new FastifyOtelInstrumentation({
    ignorePaths: (route) => isUntracedTarget(route.url),
    // The plugin writes the raw request target into `url.path`, query string
    // included. A filter value of this API can be confidential, so the value is
    // overwritten before the span is exported.
    requestHook: (span, request) => {
      const target = redactQueryString(request.url);
      if (target) span.setAttribute(ATTR_URL_PATH, target);
    },
  });
  return instrumentation;
}

/** The Fastify plugin that opens a span per request handler. */
export function fastifyTracingPlugin(): ReturnType<FastifyOtelInstrumentation['plugin']> {
  return fastifyTracingInstrumentation().plugin();
}
