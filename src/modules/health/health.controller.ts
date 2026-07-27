import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { Sequelize } from 'sequelize-typescript';
import { Public } from '../../common/auth/auth.decorators';
import { MetricsService } from '../../common/observability/metrics.service';
import { ENVIRONMENT } from '../../config/configuration.module';
import type { Environment } from '../../config/environment';
import { READER_DATABASE, WRITER_DATABASE } from '../../database/database.tokens';

/** Compares a bearer token in constant time to avoid leaking it by timing. */
function matchesBearerToken(authorization: string | undefined, expected: string): boolean {
  const [scheme, token] = authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) return false;
  const provided = Buffer.from(token);
  const reference = Buffer.from(expected);
  return provided.length === reference.length && timingSafeEqual(provided, reference);
}

@Controller()
export class HealthController {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    @Inject(READER_DATABASE) private readonly reader: Sequelize,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly metrics: MetricsService,
  ) {}

  @Public()
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ready'; dependencies: { writer: 'up'; reader: 'up' } }> {
    try {
      await Promise.all([this.writer.authenticate(), this.reader.authenticate()]);
      return { status: 'ready', dependencies: { writer: 'up', reader: 'up' } };
    } catch {
      throw new ServiceUnavailableException('A critical database dependency is unavailable');
    }
  }

  /**
   * Renders the Prometheus exposition format.
   *
   * The content type is set on the reply rather than through `@Header` because
   * a decorator applies before the handler runs: a rejected request would then
   * carry `text/plain` while the exception filter sends a JSON body, and
   * Fastify refuses that mismatch with a 500 that masks the intended 404.
   */
  @Public()
  @Get('metrics')
  async metricsEndpoint(
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('authorization') authorization?: string,
  ): Promise<string> {
    if (!this.environment.METRICS_ENABLED) throw new NotFoundException();
    // A configured token frees the endpoint from depending on an external proxy
    // rule to stay private, so a deployment without that proxy is still safe.
    const expected = this.environment.METRICS_SCRAPE_TOKEN;
    if (expected && !matchesBearerToken(authorization, expected)) throw new NotFoundException();
    void reply.header('Content-Type', this.metrics.contentType());
    return this.metrics.render();
  }
}
