import type { ArgumentsHost } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { RequestValidationError } from '../application.error';
import { HttpExceptionFilter } from '../http-exception.filter';

interface SentResponse {
  status: number;
  body: unknown;
}

function createHost(): { host: ArgumentsHost; sent: SentResponse } {
  const sent: SentResponse = { status: 0, body: undefined };
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    send(body: unknown) {
      sent.body = body;
    },
  };
  const request = { id: 'request-1', url: '/api/v1/observations?token=secret-filter' };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

function createLogger(): { logger: PinoLogger; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const logger = {
    error: (...args: unknown[]) => {
      calls.push(args);
    },
  } as unknown as PinoLogger;
  return { logger, calls };
}

describe('HttpExceptionFilter', () => {
  it('returns the field-level issues of a rejected payload', () => {
    const { host, sent } = createHost();
    const { logger } = createLogger();
    new HttpExceptionFilter(logger).catch(
      new RequestValidationError({ issues: [{ code: 'invalid_type', path: ['amount'] }] }),
      host,
    );

    expect(sent.status).toBe(400);
    expect(sent.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: { issues: [{ code: 'invalid_type', path: ['amount'] }] },
      },
      requestId: 'request-1',
    });
  });

  it('answers a throttled client with 429 and does not log it as a fault', () => {
    const { host, sent } = createHost();
    const { logger, calls } = createLogger();
    new HttpExceptionFilter(logger).catch({ statusCode: 429 }, host);

    expect(sent.status).toBe(429);
    expect(calls).toHaveLength(0);
  });

  // A plugin failure answered without a log leaves the client's status code as
  // the only evidence, which never reaches the operator.
  it('logs a server-side plugin failure instead of answering it silently', () => {
    const { host, sent } = createHost();
    const { logger, calls } = createLogger();
    new HttpExceptionFilter(logger).catch({ statusCode: 503 }, host);

    expect(sent.status).toBe(503);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toBe('Plugin request error');
  });

  it('never logs the query string of a failing request', () => {
    const { host } = createHost();
    const { logger, calls } = createLogger();
    new HttpExceptionFilter(logger).catch(new Error('boom'), host);

    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0]?.[0])).not.toContain('secret-filter');
    expect((calls[0]?.[0] as { path: string }).path).toBe('/api/v1/observations');
  });
});
