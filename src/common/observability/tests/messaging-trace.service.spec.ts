import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { MessagingTraceService, type TraceCarrier } from '../messaging-trace.service';
import { TracingService } from '../tracing.service';
import { startTracingHarness, type TracingHarness } from './tracing-test-harness';

describe('MessagingTraceService', () => {
  let harness: TracingHarness;
  const messaging = new MessagingTraceService();
  const tracing = new TracingService();

  beforeAll(() => {
    harness = startTracingHarness();
  });

  afterAll(async () => harness.shutdown());

  beforeEach(() => harness.exporter.reset());

  it('injects a W3C traceparent when a span is active', async () => {
    const carrier = await tracing.runInSpan('intelligence.submit-claims', {}, () =>
      messaging.inject(),
    );

    expect(carrier.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
  });

  it('produces an empty carrier outside a span rather than a fabricated one', () => {
    expect(messaging.inject()).toEqual({});
  });

  it('keeps the consumer in the publisher trace', async () => {
    const carrier = await tracing.runInSpan('intelligence.submit-claims', {}, () =>
      messaging.inject(),
    );
    const publisher = harness.exporter.getFinishedSpans()[0];
    harness.exporter.reset();

    await messaging.consume('intelligence.reprocess-observation', carrier, {}, () => undefined);

    const consumer = harness.exporter.getFinishedSpans()[0];
    expect(consumer?.kind).toBe(SpanKind.CONSUMER);
    expect(consumer?.spanContext().traceId).toBe(publisher?.spanContext().traceId);
    expect(consumer?.parentSpanContext?.spanId).toBe(publisher?.spanContext().spanId);
    expect(consumer?.spanContext().spanId).not.toBe(publisher?.spanContext().spanId);
  });

  it('processes a message with no trace metadata, as older messages have', async () => {
    await messaging.consume('intelligence.reprocess-observation', undefined, {}, () => 'ok');
    await messaging.consume('intelligence.reprocess-observation', {}, {}, () => 'ok');
    await messaging.consume(
      'intelligence.reprocess-observation',
      { traceparent: 'not-a-traceparent' },
      {},
      () => 'ok',
    );

    const spans = harness.exporter.getFinishedSpans();
    expect(spans).toHaveLength(3);
    expect(spans.every((span) => span.parentSpanContext === undefined)).toBe(true);
  });

  it('does not mutate the carrier it receives', async () => {
    const carrier: TraceCarrier = { 'x-domain-header': 'kept' };
    const snapshot = { ...carrier };

    await messaging.consume('intelligence.reprocess-observation', carrier, {}, () => undefined);

    expect(carrier).toEqual(snapshot);
  });

  it('marks the consumer span as failed and rethrows', async () => {
    const failure = new Error('consumer failed');

    await expect(
      messaging.consume('intelligence.reprocess-observation', {}, {}, () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(harness.exporter.getFinishedSpans()[0]?.status.code).toBe(SpanStatusCode.ERROR);
  });
});
