/**
 * End-to-end verification of the tracing pipeline over a real HTTP server.
 *
 * The tracer provider and the instrumentations are registered by
 * `tracing-setup.ts`, wired as a Jest `setupFiles` entry, which is the only
 * point that runs before Nest and Fastify are loaded — the same ordering
 * constraint `telemetry.bootstrap.ts` satisfies in the running process.
 */
import { Controller, Get, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { SpanStatusCode } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor, type ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { PinoLogger } from 'nestjs-pino';
import { RequestContextInterceptor } from '../../src/common/http/request-context.interceptor';
import { fastifyTracingPlugin } from '../../src/common/observability/fastify-tracing.plugin';
import { MetricsService } from '../../src/common/observability/metrics.service';
import { TraceContextService } from '../../src/common/observability/trace-context.service';
import { TracingService } from '../../src/common/observability/tracing.service';
import { spanExporter, stopTestTelemetry } from './tracing-registry';

const logger = { info: () => undefined } as unknown as PinoLogger;

@Controller()
class ProbeController {
  constructor(private readonly tracing: TracingService) {}

  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Get('probe')
  probe(): Promise<{ ok: boolean }> {
    return this.tracing.runInSpan('probe.execute', { 'app.module': 'probe' }, () => ({ ok: true }));
  }

  @Get('probe/fail')
  fail(): Promise<never> {
    return this.tracing.runInSpan('probe.execute', {}, () => {
      throw new Error('SELECT * FROM audit WHERE nit = 4820913');
    });
  }
}

@Module({
  controllers: [ProbeController],
  providers: [
    TracingService,
    TraceContextService,
    MetricsService,
    { provide: PinoLogger, useValue: logger },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
  ],
})
class ProbeModule {}

function named(spans: readonly ReadableSpan[], name: string): ReadableSpan | undefined {
  return spans.find((span) => span.name === name);
}

/** Serializes only the exported fields; a ReadableSpan holds circular references. */
function exportedContent(spans: readonly ReadableSpan[]): string {
  return JSON.stringify(
    spans.map((span) => ({
      name: span.name,
      attributes: span.attributes,
      status: span.status,
      events: span.events,
      resource: span.resource.attributes,
    })),
  );
}

describe('Distributed tracing over HTTP', () => {
  let application: NestFastifyApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleReference = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    application = moduleReference.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { logger: false },
    );
    // Registered exactly as `src/main.ts` registers it.
    await application.register(fastifyTracingPlugin());
    await application.init();
    await application.listen(0, '127.0.0.1');
    baseUrl = await application.getUrl();
  });

  afterAll(async () => {
    await application.close();
    await stopTestTelemetry();
  });

  beforeEach(() => spanExporter.reset());

  it('traces a request end to end and returns the trace id to the caller', async () => {
    const response = await fetch(`${baseUrl}/probe`);
    const traceHeader = response.headers.get('x-trace-id');

    expect(response.status).toBe(200);
    expect(traceHeader).toMatch(/^[0-9a-f]{32}$/);

    const spans = spanExporter.getFinishedSpans();
    const business = named(spans, 'probe.execute');
    expect(business).toBeDefined();
    expect(business?.spanContext().traceId).toBe(traceHeader);
    // The business span hangs off the server span rather than starting its own
    // trace: that parent-child link is what makes a latency breakdown readable.
    expect(business?.parentSpanContext).toBeDefined();
    expect(spans.length).toBeGreaterThan(1);
    expect(spans.every((span) => span.spanContext().traceId === traceHeader)).toBe(true);
  });

  it('continues an incoming W3C trace instead of starting a new one', async () => {
    const incoming = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';

    const response = await fetch(`${baseUrl}/probe`, { headers: { traceparent: incoming } });

    expect(response.headers.get('x-trace-id')).toBe('0af7651916cd43dd8448eb211c80319c');
  });

  it('marks a failed request and never publishes the raw error message', async () => {
    const response = await fetch(`${baseUrl}/probe/fail`);

    expect(response.status).toBe(500);
    const spans = spanExporter.getFinishedSpans();
    expect(named(spans, 'probe.execute')?.status.code).toBe(SpanStatusCode.ERROR);
    expect(exportedContent(spans)).not.toContain('4820913');
  });

  it('produces no span for an excluded infrastructure probe', async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(spanExporter.getFinishedSpans()).toHaveLength(0);
  });

  it('never publishes an authorization header as a span attribute', async () => {
    await fetch(`${baseUrl}/probe?entityCode=NIT-12345`, {
      headers: { authorization: 'Bearer super-secret-token' },
    });

    const serialized = exportedContent(spanExporter.getFinishedSpans());
    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).not.toContain('NIT-12345');
  });

  it('keeps serving when the tracing backend is unreachable', async () => {
    // Port 1 is closed. A batch processor pointed at it must fail in the
    // background without ever delaying or breaking a business request.
    const deadProcessor = new BatchSpanProcessor(
      new OTLPTraceExporter({ url: 'http://127.0.0.1:1/v1/traces', timeoutMillis: 1000 }),
    );

    const startedAt = Date.now();
    const response = await fetch(`${baseUrl}/probe`);
    const elapsed = Date.now() - startedAt;

    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(1000);
    await deadProcessor.shutdown().catch(() => undefined);
  });
});
