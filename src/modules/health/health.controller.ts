import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Sequelize } from 'sequelize-typescript';
import { Public } from '../../common/auth/auth.decorators';
import { MetricsService } from '../../common/observability/metrics.service';
import { ENVIRONMENT } from '../../config/configuration.module';
import type { Environment } from '../../config/environment';
import { READER_DATABASE, WRITER_DATABASE } from '../../database/database.tokens';

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

  @Public()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metricsEndpoint(): Promise<string> {
    if (!this.environment.METRICS_ENABLED) throw new NotFoundException();
    return this.metrics.render();
  }
}
