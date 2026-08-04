import { SpanStatusCode } from '@opentelemetry/api';
import { TracingService } from '../tracing.service';
import { startTracingHarness, type TracingHarness } from './tracing-test-harness';

describe('TracingService', () => {
  let harness: TracingHarness;
  let tracing: TracingService;

  beforeAll(() => {
    harness = startTracingHarness();
  });

  afterAll(async () => harness.shutdown());

  beforeEach(() => {
    harness.exporter.reset();
    tracing = new TracingService();
  });

  it('creates a named span with its attributes and returns the result', async () => {
    const result = await tracing.runInSpan(
      'intelligence.submit-claims',
      { 'app.module': 'x' },
      () => Promise.resolve(42),
    );

    const [span] = harness.exporter.getFinishedSpans();
    expect(result).toBe(42);
    expect(span?.name).toBe('intelligence.submit-claims');
    expect(span?.attributes['app.module']).toBe('x');
    expect(span?.status.code).not.toBe(SpanStatusCode.ERROR);
  });

  it('supports a synchronous operation', async () => {
    const result = await tracing.runInSpan('query.search-observations', {}, () => 'done');

    expect(result).toBe('done');
    expect(harness.exporter.getFinishedSpans()).toHaveLength(1);
  });

  it('ends the span, marks the error and rethrows the original exception', async () => {
    const failure = new RangeError('bound value 4242 out of range');

    await expect(
      tracing.runInSpan('ingestion.import-batch', {}, () => Promise.reject(failure)),
    ).rejects.toBe(failure);

    const [span] = harness.exporter.getFinishedSpans();
    expect(span?.status.code).toBe(SpanStatusCode.ERROR);
    expect(span?.events[0]?.name).toBe('exception');
  });

  it('never publishes the raw error message', async () => {
    await expect(
      tracing.runInSpan('ingestion.import-batch', {}, () => {
        throw new Error('INSERT INTO statistics.observation VALUES (secret-taxpayer-id)');
      }),
    ).rejects.toThrow();

    const [span] = harness.exporter.getFinishedSpans();
    expect(JSON.stringify(span?.events)).not.toContain('secret-taxpayer-id');
    expect(span?.status.message).toBe('Error');
  });

  it('nests a child span under the active one', async () => {
    await tracing.runInSpan('intelligence.daily-analysis', {}, () =>
      tracing.runInSpan('intelligence.submit-claims', {}, () => undefined),
    );

    const spans = harness.exporter.getFinishedSpans();
    const child = spans.find((span) => span.name === 'intelligence.submit-claims');
    const parent = spans.find((span) => span.name === 'intelligence.daily-analysis');
    expect(child?.parentSpanContext?.spanId).toBe(parent?.spanContext().spanId);
    expect(child?.spanContext().traceId).toBe(parent?.spanContext().traceId);
  });

  it('detaches a root span from the ambient context', async () => {
    await tracing.runInSpan('intelligence.daily-analysis', {}, () =>
      tracing.runInRootSpan('scheduler.domain-metrics', {}, () => undefined),
    );

    const spans = harness.exporter.getFinishedSpans();
    const job = spans.find((span) => span.name === 'scheduler.domain-metrics');
    const request = spans.find((span) => span.name === 'intelligence.daily-analysis');
    expect(job?.parentSpanContext).toBeUndefined();
    expect(job?.spanContext().traceId).not.toBe(request?.spanContext().traceId);
  });

  it('adds events and attributes to the active span', async () => {
    await tracing.runInSpan('provenance.register-artifact', {}, () => {
      tracing.addEvent('artifact.hashed');
      tracing.setAttributes({ 'app.entity.type': 'source-artifact' });
    });

    const [span] = harness.exporter.getFinishedSpans();
    expect(span?.events.map((event) => event.name)).toContain('artifact.hashed');
    expect(span?.attributes['app.entity.type']).toBe('source-artifact');
  });

  it('does nothing when there is no active span', () => {
    expect(() => {
      tracing.addEvent('orphan');
      tracing.setAttributes({ 'app.module': 'none' });
      tracing.recordException(new Error('orphan failure'));
    }).not.toThrow();
    expect(harness.exporter.getFinishedSpans()).toHaveLength(0);
  });
});
