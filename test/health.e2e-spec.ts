import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { MetricsService } from '../src/common/observability/metrics.service';
import { ENVIRONMENT } from '../src/config/configuration.module';
import { READER_DATABASE, WRITER_DATABASE } from '../src/database/database.tokens';
import { HealthController } from '../src/modules/health/health.controller';

const database = { authenticate: jest.fn().mockResolvedValue(undefined) };

describe('Health endpoints', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        MetricsService,
        { provide: WRITER_DATABASE, useValue: database },
        { provide: READER_DATABASE, useValue: database },
        {
          provide: ENVIRONMENT,
          useValue: { METRICS_ENABLED: true, APP_NAME: 'observatorio-economico-core' },
        },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => app.close());

  it('reports liveness', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('reports the build and the moment it started', async () => {
    const response = await app.inject({ method: 'GET', url: '/version' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { name: string; startedAt: string; uptimeSeconds: number };
    expect(body.name).toBe('observatorio-economico-core');
    // The deployment pipeline compares this instant against the moment it asked
    // for the deploy, so it has to parse as a date and not drift into the future.
    expect(Number.isNaN(Date.parse(body.startedAt))).toBe(false);
    expect(Date.parse(body.startedAt)).toBeLessThanOrEqual(Date.now());
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('reports database readiness', async () => {
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ready');
  });
});
