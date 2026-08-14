import { Injectable } from '@nestjs/common';
import { context, trace } from '@opentelemetry/api';

/** Identifiers of the span currently executing, when tracing is active. */
export interface ActiveTraceContext {
  readonly traceId?: string;
  readonly spanId?: string;
}

/** The all-zero identifier the specification uses to mean "no trace". */
const INVALID_TRACE_ID = '00000000000000000000000000000000';

/**
 * Reads the identifiers of the active span.
 *
 * These are the values handed to support and written next to a log line, so
 * they must be either real or absent. A fabricated identifier would point to a
 * trace that does not exist and send an operator hunting for nothing.
 */
@Injectable()
export class TraceContextService {
  /** Returns the active identifiers, or an empty object when there is no span. */
  current(): ActiveTraceContext {
    const spanContext = trace.getSpan(context.active())?.spanContext();
    if (!spanContext || spanContext.traceId === INVALID_TRACE_ID) return {};
    return { traceId: spanContext.traceId, spanId: spanContext.spanId };
  }

  /** Returns the active trace identifier, or `undefined` when there is none. */
  traceId(): string | undefined {
    return this.current().traceId;
  }

  /** Returns the active span identifier, or `undefined` when there is none. */
  spanId(): string | undefined {
    return this.current().spanId;
  }
}
