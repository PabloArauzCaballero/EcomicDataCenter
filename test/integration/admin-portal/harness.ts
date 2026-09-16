import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { Sequelize } from 'sequelize';
import { AppModule } from '../../../src/app.module';
import { resetEnvironmentForTests } from '../../../src/config/environment';

/**
 * Boots the real application graph against the disposable integration database.
 *
 * It is the whole module, not a hand-assembled subset: the point of these tests
 * is that the wiring works, and a module list written by hand in the test is a
 * second wiring that can agree with itself while the application disagrees.
 *
 * Everything the environment needs is derived from `INTEGRATION_DATABASE_URL`
 * and nothing is read from `.env`. A suite that truncates tables must not be
 * able to reach a remote database because a shell forgot an override.
 */
export const INTEGRATION_DATABASE_URL = process.env['INTEGRATION_DATABASE_URL'];
export const hasIntegrationDatabase = Boolean(INTEGRATION_DATABASE_URL);
export const describeIntegration = hasIntegrationDatabase ? describe : describe.skip;

export interface AdminHarness {
  readonly module: TestingModule;
  readonly database: Sequelize;
  close(): Promise<void>;
}

/** Applies the environment the application will read, before anything reads it. */
export function applyIntegrationEnvironment(overrides: Record<string, string> = {}): void {
  const url = INTEGRATION_DATABASE_URL;
  if (!url) throw new Error('INTEGRATION_DATABASE_URL is required for integration tests');
  const environment: Record<string, string> = {
    NODE_ENV: 'test',
    AUTH_MODE: 'disabled',
    DATABASE_SSL: 'false',
    DATABASE_PROVISION_ON_BOOT: 'false',
    SNAPSHOT_REFRESH_ON_BOOT: 'false',
    ADMIN_ENVIRONMENT_ID: 'integration',
    SEED_PROFILE: 'historical',
    SEED_DEMO_ENABLED: 'false',
    HEALTH_MONITOR_ENABLED: 'false',
    METRICS_ENABLED: 'false',
    OTEL_ENABLED: 'false',
    LOG_LEVEL: 'error',
    DATABASE_WRITER_URL: process.env['DATABASE_WRITER_URL'] ?? url,
    DATABASE_READER_URL: process.env['DATABASE_READER_URL'] ?? url,
    DATABASE_MIGRATOR_URL: process.env['DATABASE_MIGRATOR_URL'] ?? url,
    ...overrides,
  };
  for (const [key, value] of Object.entries(environment)) process.env[key] = value;
  for (const key of ['SEED_FAULT_INJECTION']) {
    if (!(key in overrides)) delete process.env[key];
  }
  if (overrides['SEED_FAULT_INJECTION']) {
    process.env['SEED_FAULT_INJECTION'] = overrides['SEED_FAULT_INJECTION'];
  }
  resetEnvironmentForTests();
}

export async function startAdminHarness(
  overrides: Record<string, string> = {},
): Promise<AdminHarness> {
  applyIntegrationEnvironment(overrides);
  const module = await Test.createTestingModule({
    imports: [AppModule],
    // The testing module does not install Nest's HTTP Reflector, and both
    // global guards need it while their providers are constructed.
    providers: [Reflector],
  }).compile();
  await module.init();
  const database = new Sequelize(INTEGRATION_DATABASE_URL as string, {
    dialect: 'postgres',
    logging: false,
    pool: { max: 5, min: 0, idle: 1_000, acquire: 10_000 },
  });
  return {
    module,
    database,
    close: async (): Promise<void> => {
      await module.close();
      await database.close();
    },
  };
}

/**
 * Empties only the operational register, never the domain.
 *
 * The seed tests need a clean ledger and nothing else: truncating the
 * catalogues they are about to compare against would make every difference
 * report say «missing», which is the answer the test is supposed to earn.
 */
export async function truncateOperations(database: Sequelize): Promise<void> {
  await database.query(`
TRUNCATE TABLE
  operations.alert_delivery,
  operations.health_incident,
  operations.health_probe,
  operations.traffic_event,
  operations.export_request,
  operations.read_model_publication,
  operations.ingestion_event,
  operations.seed_run,
  operations.seed_application
RESTART IDENTITY CASCADE;
  `);
}
