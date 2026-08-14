import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PinoLogger } from 'nestjs-pino';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MetricsService } from '../observability/metrics.service';
import { TraceContextService } from '../observability/trace-context.service';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: PinoLogger,
    private readonly metrics: MetricsService,
    private readonly traceContext: TraceContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const startedAt = process.hrtime.bigint();
    // Surface the correlation id on every response, not just error bodies, so an
    // operator handed "request X was slow" can map it to the server log line.
    void response.header('x-request-id', String(request.id));
    // The trace id is what a user can hand to support. It comes from the active
    // OpenTelemetry context, never from a client header, and is omitted rather
    // than faked when tracing is disabled — an invented id would send an
    // operator looking for a trace that does not exist.
    const traceId = this.traceContext.traceId();
    if (traceId) void response.header('x-trace-id', traceId);
    return next.handle().pipe(
      finalize(() => {
        // Observability must never break request delivery: a throw inside this
        // teardown callback would corrupt the response and hang the connection.
        try {
          const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
          const route = request.routeOptions.url ?? 'unmatched';
          this.metrics.observeRequest(request.method, route, response.statusCode, durationMs);
          this.logger.info(
            {
              requestId: request.id,
              method: request.method,
              route,
              statusCode: response.statusCode,
              durationMs,
            },
            'Request completed',
          );
        } catch (error) {
          process.stderr.write(
            `Request observability failed: ${error instanceof Error ? error.message : String(error)}\n`,
          );
        }
      }),
    );
  }
}
