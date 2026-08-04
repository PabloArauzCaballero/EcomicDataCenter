import { TraceContextService } from '../trace-context.service';
import { TracingService } from '../tracing.service';
import { startTracingHarness, type TracingHarness } from './tracing-test-harness';

describe('TraceContextService', () => {
  let harness: TracingHarness;
  const traceContext = new TraceContextService();
  const tracing = new TracingService();

  beforeAll(() => {
    harness = startTracingHarness();
  });

  afterAll(async () => harness.shutdown());

  it('returns the identifiers of the active span', async () => {
    const observed = await tracing.runInSpan('query.search-observations', {}, () =>
      traceContext.current(),
    );

    expect(observed.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(observed.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('reports the same trace and a different span for a nested operation', async () => {
    const observed = await tracing.runInSpan('intelligence.daily-analysis', {}, async () => {
      const outer = traceContext.current();
      const inner = await tracing.runInSpan('intelligence.submit-claims', {}, () =>
        traceContext.current(),
      );
      return { outer, inner };
    });

    expect(observed.inner.traceId).toBe(observed.outer.traceId);
    expect(observed.inner.spanId).not.toBe(observed.outer.spanId);
  });

  it('reports nothing outside a span instead of inventing an identifier', () => {
    expect(traceContext.current()).toEqual({});
    expect(traceContext.traceId()).toBeUndefined();
    expect(traceContext.spanId()).toBeUndefined();
  });
});
