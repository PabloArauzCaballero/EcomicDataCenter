import { SpanStatusCode, type Span } from '@opentelemetry/api';
import { toSafeErrorLog } from '../errors/error-logging';

/**
 * Records a failure on a span without publishing the raw error message.
 *
 * A driver error message can embed SQL text and bound values, and a trace is
 * readable by everyone with access to the tracing backend. Applying the same
 * sanitisation the log pipeline uses keeps the span diagnostic — error type,
 * error code and stack frames — without turning it into a data leak.
 *
 * Shared by the tracing service, the messaging contract and the exception
 * filter so that all three report a failure identically.
 */
export function recordSpanFailure(span: Span, error: unknown): void {
  const safe = toSafeErrorLog(error);
  span.recordException({
    name: safe.errorName,
    ...(safe.errorCode ? { code: safe.errorCode } : {}),
    ...(safe.stackFrames ? { stack: safe.stackFrames } : {}),
  });
  span.setStatus({ code: SpanStatusCode.ERROR, message: safe.errorName });
}
