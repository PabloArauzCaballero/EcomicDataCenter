import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PinoLogger } from 'nestjs-pino';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MetricsService } from '../observability/metrics.service';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: PinoLogger,
    private readonly metrics: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const startedAt = process.hrtime.bigint();
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
