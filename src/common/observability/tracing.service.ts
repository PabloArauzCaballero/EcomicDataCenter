import { Injectable } from '@nestjs/common';
import {
  context,
  ROOT_CONTEXT,
  SpanKind,
  trace,
  type Attributes,
  type Span,
} from '@opentelemetry/api';
import { recordSpanFailure } from './span-failure';
import { TRACER_NAME } from './telemetry.constants';

/** Work executed inside a span; may be synchronous or asynchronous. */
export type TracedOperation<T> = (span: Span) => Promise<T> | T;

/**
 * The tracing surface the rest of the application depends on.
 *
 * Domain services inject this instead of importing OpenTelemetry, so swapping
 * the tracing backend — or removing it — never reaches business code. When
 * tracing is disabled the OpenTelemetry API returns no-op spans and every
 * method here becomes a cheap call with no exporter behind it.
 */
@Injectable()
export class TracingService {
  private readonly tracer = trace.getTracer(TRACER_NAME);

  /**
   * Runs the operation inside a child span of the active context.
   *
   * The span always ends, errors are recorded and the original error is
   * rethrown untouched: observability must never change what the caller sees.
   */
  async runInSpan<T>(
    name: string,
    attributes: Attributes,
    operation: TracedOperation<T>,
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, { attributes }, async (span) => {
      try {
        return await operation(span);
      } catch (error) {
        recordSpanFailure(span, error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Runs the operation as a new trace, detached from any ambient context.
   *
   * Scheduled work has no incoming request to inherit from; attaching it to
   * whatever context happened to be active would produce a trace that mixes an
   * unrelated request with a background job.
   */
  async runInRootSpan<T>(
    name: string,
    attributes: Attributes,
    operation: TracedOperation<T>,
  ): Promise<T> {
    return this.tracer.startActiveSpan(
      name,
      { attributes, kind: SpanKind.INTERNAL },
      ROOT_CONTEXT,
      async (span) => {
        try {
          return await operation(span);
        } catch (error) {
          recordSpanFailure(span, error);
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  /** Marks a milestone inside the active span without creating a new one. */
  addEvent(name: string, attributes?: Attributes): void {
    trace.getSpan(context.active())?.addEvent(name, attributes);
  }

  /** Adds attributes to the active span, if any. */
  setAttributes(attributes: Attributes): void {
    trace.getSpan(context.active())?.setAttributes(attributes);
  }

  /** Records an exception on the active span and marks it as failed. */
  recordException(error: unknown): void {
    const span = trace.getSpan(context.active());
    if (span) recordSpanFailure(span, error);
  }
}
