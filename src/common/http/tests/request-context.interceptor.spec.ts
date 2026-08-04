import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { MetricsService } from '../../observability/metrics.service';
import {
  startTracingHarness,
  type TracingHarness,
} from '../../observability/tests/tracing-test-harness';
import { TraceContextService } from '../../observability/trace-context.service';
import { TracingService } from '../../observability/tracing.service';
import { RequestContextInterceptor } from '../request-context.interceptor';

interface CapturedHeaders {
  [name: string]: string;
}

function buildContext(headers: CapturedHeaders): ExecutionContext {
  const request = {
    id: 'req-1',
    method: 'POST',
    routeOptions: { url: '/api/v1/intelligence/daily-analysis' },
  };
  const response = {
    statusCode: 200,
    header: (name: string, value: string) => {
      headers[name] = value;
      return response;
    },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
}

describe('RequestContextInterceptor', () => {
  let harness: TracingHarness;
  const logger = { info: jest.fn() };
  const metrics = new MetricsService();
  const tracing = new TracingService();

  function buildInterceptor(): RequestContextInterceptor {
    return new RequestContextInterceptor(logger as never, metrics, new TraceContextService());
  }

  beforeAll(() => {
    harness = startTracingHarness();
  });

  afterAll(async () => harness.shutdown());

  it('publishes the active trace id as a response header', async () => {
    const headers: CapturedHeaders = {};
    const context = buildContext(headers);
    const next: CallHandler = { handle: () => of('body') };

    const observed = await tracing.runInSpan('intelligence.daily-analysis', {}, async () => {
      await firstValueFrom(buildInterceptor().intercept(context, next));
      return headers;
    });

    expect(observed['x-request-id']).toBe('req-1');
    expect(observed['x-trace-id']).toMatch(/^[0-9a-f]{32}$/);
  });

  it('omits the trace header when tracing is inactive instead of faking one', async () => {
    const headers: CapturedHeaders = {};
    const next: CallHandler = { handle: () => of('body') };

    await firstValueFrom(buildInterceptor().intercept(buildContext(headers), next));

    expect(headers['x-request-id']).toBe('req-1');
    expect(headers['x-trace-id']).toBeUndefined();
  });

  it('preserves the original error and still records the request', async () => {
    const failure = new Error('handler failed');
    const headers: CapturedHeaders = {};
    const next: CallHandler = { handle: () => throwError(() => failure) };

    await expect(
      firstValueFrom(buildInterceptor().intercept(buildContext(headers), next)),
    ).rejects.toBe(failure);
    expect(logger.info).toHaveBeenCalled();
  });
});
