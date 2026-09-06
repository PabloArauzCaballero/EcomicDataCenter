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
import type { Sequelize } from 'sequelize-typescript';
import { Public } from '../../common/auth/auth.decorators';
import { matchesBearerToken } from '../../common/auth/bearer-token';
import { MetricsService } from '../../common/observability/metrics.service';
import { ENVIRONMENT } from '../../config/configuration.module';
import type { Environment } from '../../config/environment';
import { READER_DATABASE, WRITER_DATABASE } from '../../database/database.tokens';

/**
 * The instant this process began, fixed when the module is first evaluated.
 *
 * It exists so a deployment can prove that it happened. Coolify builds this
 * image on a server that GitHub cannot reach, and the credential the pipeline
 * carries only fires the webhook: asking the platform how its own deployment
 * went needs a token with read permission that this one does not have. A start
 * time later than the moment the deploy was requested can only belong to the
 * container that deploy created, so the pipeline can wait for it and fail when
 * it never arrives.
 */
const STARTED_AT = new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString();

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

  /**
   * What is running here, and since when.
   *
   * Public, like liveness and readiness: it reports the moment of a restart and
   * the name the build carries, and neither says anything about the data or the
   * infrastructure that an unauthenticated caller could turn against them.
   */
  @Public()
  @Get('version')
  version(): { name: string; startedAt: string; uptimeSeconds: number } {
    return {
      name: this.environment.APP_NAME,
      startedAt: STARTED_AT,
      uptimeSeconds: Math.round(process.uptime()),
    };
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
