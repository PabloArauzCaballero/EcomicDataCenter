import type { ArgumentsHost } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { SpanStatusCode } from '@opentelemetry/api';
import type { PinoLogger } from 'nestjs-pino';
import {
  startTracingHarness,
  type TracingHarness,
} from '../../observability/tests/tracing-test-harness';
import { TracingService } from '../../observability/tracing.service';
import { InfrastructureError } from '../application.error';
import { HttpExceptionFilter } from '../http-exception.filter';

function createHost(): ArgumentsHost {
  const response = {
    status() {
      return this;
    },
    send() {
      return undefined;
    },
  };
  const request = { id: 'request-1', url: '/api/v1/data/observations' };
  return {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
}

const logger = { error: jest.fn() } as unknown as PinoLogger;

describe('HttpExceptionFilter tracing', () => {
  let harness: TracingHarness;
  const tracing = new TracingService();

  beforeAll(() => {
    harness = startTracingHarness();
  });

  afterAll(async () => harness.shutdown());

  beforeEach(() => harness.exporter.reset());

  async function handleInsideSpan(exception: unknown): Promise<void> {
    await tracing.runInSpan('http.request', {}, () => {
      new HttpExceptionFilter(logger).catch(exception, createHost());
    });
  }

  it('records a server fault on the active span exactly once', async () => {
    await handleInsideSpan(new InfrastructureError('database unavailable'));

    const [span] = harness.exporter.getFinishedSpans();
    expect(span?.status.code).toBe(SpanStatusCode.ERROR);
    expect(span?.events.filter((event) => event.name === 'exception')).toHaveLength(1);
  });

  it('records an unhandled exception', async () => {
    await handleInsideSpan(new Error('unexpected'));

    expect(harness.exporter.getFinishedSpans()[0]?.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('leaves the span untouched for an expected client outcome', async () => {
    await handleInsideSpan(new NotFoundException('missing'));

    const [span] = harness.exporter.getFinishedSpans();
    expect(span?.status.code).not.toBe(SpanStatusCode.ERROR);
    expect(span?.events).toHaveLength(0);
  });

  it('never publishes the raw error message on the span', async () => {
    await handleInsideSpan(new Error('SELECT * FROM audit WHERE nit = 4820913'));

    const [span] = harness.exporter.getFinishedSpans();
    expect(JSON.stringify(span?.events)).not.toContain('4820913');
  });

  it('does not fail when no span is active', () => {
    expect(() =>
      new HttpExceptionFilter(logger).catch(new Error('outside any span'), createHost()),
    ).not.toThrow();
  });
});
