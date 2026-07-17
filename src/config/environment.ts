import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_HOST: z.string().default('127.0.0.1'),
    APP_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    APP_NAME: z.string().default('observatorio-economico-core'),
    API_PREFIX: z.string().regex(/^[a-z0-9/_-]+$/).default('api'),
    API_VERSION: z.string().regex(/^v\d+$/).default('v1'),
    CORS_ORIGINS: z.string().default(''),
    BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(10_485_760).default(1_048_576),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100_000).default(300),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3_600_000).default(60_000),
    HTTP_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
    HTTP_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),
    HTTP_KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(72_000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    TRUST_PROXY: booleanFromString,
    DATABASE_WRITER_URL: z.string().min(1),
    DATABASE_READER_URL: z.string().min(1),
    DATABASE_MIGRATOR_URL: z.string().min(1).optional(),
    DATABASE_SSL: booleanFromString,
    DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(5000),
    DATABASE_POOL_MAX_WRITER: z.coerce.number().int().min(1).max(100).default(15),
    DATABASE_POOL_MAX_READER: z.coerce.number().int().min(1).max(100).default(30),
    DATABASE_POOL_MIN: z.coerce.number().int().min(0).max(20).default(0),
    DATABASE_POOL_ACQUIRE_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
    DATABASE_POOL_IDLE_MS: z.coerce.number().int().min(1000).max(300_000).default(10_000),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(15_000),
    AUTH_MODE: z.enum(['disabled', 'jwks']).default('disabled'),
    AUTH_JWKS_URI: z.string().url().optional(),
    AUTH_ISSUER: z.string().min(1).optional(),
    AUTH_AUDIENCE: z.string().min(1).optional(),
    AUTH_ROLE_CLAIM: z.string().min(1).default('roles'),
    AUTH_ORGANIZATION_CLAIM: z.string().min(1).default('organization_id'),
    SWAGGER_ENABLED: booleanFromString,
    METRICS_ENABLED: booleanFromString,
    BACKUP_ENABLED: booleanFromString,
    BACKUP_STRATEGY: z.enum(['pg_dump', 'managed_pitr']).default('pg_dump'),
    BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
    BACKUP_DESTINATION: z.string().min(1).default('/backups'),
    BACKUP_ENCRYPTION_ENABLED: booleanFromString,
    BACKUP_COMPRESSION: z.enum(['none', 'gzip', 'custom']).default('custom'),
    BACKUP_MAX_DURATION_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && environment.AUTH_MODE === 'disabled') {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message: 'AUTH_MODE=disabled is forbidden in production',
      });
    }
    if (environment.NODE_ENV === 'production' && environment.SWAGGER_ENABLED) {
      context.addIssue({
        code: 'custom',
        path: ['SWAGGER_ENABLED'],
        message: 'Swagger must be disabled in production',
      });
    }
    if (environment.AUTH_MODE === 'jwks') {
      for (const key of ['AUTH_JWKS_URI', 'AUTH_ISSUER', 'AUTH_AUDIENCE'] as const) {
        if (!environment[key]) {
          context.addIssue({ code: 'custom', path: [key], message: `${key} is required` });
        }
      }
    }
    if (environment.NODE_ENV === 'production' && !environment.DATABASE_MIGRATOR_URL) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_MIGRATOR_URL'],
        message: 'A separate migrator credential is required in production',
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

let cachedEnvironment: Environment | undefined;

/** Validates process environment once and returns a typed immutable configuration. */
export function getEnvironment(): Environment {
  cachedEnvironment ??= Object.freeze(environmentSchema.parse(process.env));
  return cachedEnvironment;
}

/** Clears the module cache so tests can validate independent environment scenarios. */
export function resetEnvironmentForTests(): void {
  cachedEnvironment = undefined;
}
