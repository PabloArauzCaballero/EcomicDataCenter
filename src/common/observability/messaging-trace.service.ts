import { Injectable } from '@nestjs/common';
import {
  context,
  propagation,
  SpanKind,
  trace,
  type Attributes,
  type Context,
  type Span,
} from '@opentelemetry/api';
import { recordSpanFailure } from './span-failure';
import { TRACER_NAME } from './telemetry.constants';

/** Transport-neutral carrier of W3C trace headers (`traceparent`, `tracestate`). */
export type TraceCarrier = Record<string, string>;

/** Work executed inside a consumer span. */
export type ConsumedOperation<T> = (span: Span) => Promise<T> | T;

/**
 * Carries trace context across an asynchronous boundary.
 *
 * OpenTelemetry propagates context within a process only. When a message is
 * written somewhere and read later — by another process, or by the same process
 * after a restart — the context has to travel with the message. This service is
 * the contract for that hop, independent of any queue technology.
 *
 * ADR-0003 keeps this system free of queues and workers, so nothing publishes
 * through it today. It exists, and is tested, so that the first approved
 * deferred process inherits a propagation contract instead of inventing one:
 * `docs/observability/01-architecture-design.md` §9.
 */
@Injectable()
export class MessagingTraceService {
  private readonly tracer = trace.getTracer(TRACER_NAME);

  /**
   * Writes the active context into a new carrier.
   *
   * Returns an empty carrier when no span is active, which a consumer reads as
   * "start a new trace" rather than as an error.
   */
  inject(): TraceCarrier {
    const carrier: TraceCarrier = {};
    propagation.inject(context.active(), carrier);
    return carrier;
  }

  /**
   * Rebuilds the publishing context from a carrier.
   *
   * A missing, empty or malformed carrier yields the current context, so
   * messages written before this contract existed keep being processed.
   */
  extract(carrier: TraceCarrier | undefined): Context {
    if (!carrier) return context.active();
    return propagation.extract(context.active(), carrier);
  }

  /**
   * Runs the consumer inside a span linked to the publisher.
   *
   * The span is a `CONSUMER`, which is what makes a tracing backend render the
   * asynchronous hop instead of showing two unrelated traces.
   */
  async consume<T>(
    name: string,
    carrier: TraceCarrier | undefined,
    attributes: Attributes,
    operation: ConsumedOperation<T>,
  ): Promise<T> {
    return this.tracer.startActiveSpan(
      name,
      { attributes, kind: SpanKind.CONSUMER },
      this.extract(carrier),
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
}
