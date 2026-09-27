import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

/**
 * Declares a variable optional while reading an empty value as absent.
 *
 * Hosting platforms inject variables that exist in their dashboard but were
 * left blank as an empty string instead of omitting them, and `""` still runs
 * the field's own checks: a blank ingestion key failed its minimum length and
 * aborted boot before any code ran. Absent and blank now mean the same thing.
 * A blank secret never becomes a usable one -- it reads as "not configured",
 * which the rules below still reject wherever a value is actually required.
 */
const optional = <Schema extends z.ZodTypeAny>(schema: Schema) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_HOST: z.string().default('127.0.0.1'),
    APP_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    // Injected by the platform on Render, Heroku, Fly and Cloud Run. It wins
    // over APP_PORT because the host routes traffic to the port it assigned:
    // binding anywhere else makes the deploy loop until it times out.
    PORT: optional(z.coerce.number().int().min(1).max(65_535)),
    APP_NAME: z.string().default('observatorio-economico-core'),
    API_PREFIX: z
      .string()
      .regex(/^[a-z0-9/_-]+$/)
      .default('api'),
    API_VERSION: z
      .string()
      .regex(/^v\d+$/)
      .default('v1'),
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
    DATABASE_MIGRATOR_URL: optional(z.string().min(1)),
    DATABASE_SSL: booleanFromString,
    /**
     * Whether starting the process brings the database up to date.
     *
     * On by default because the platform offers no release step to run
     * migrations from, so a deployment would otherwise need a manual one.
     */
    DATABASE_PROVISION_ON_BOOT: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    /**
     * Whether a replica fills, after it is listening, the stored copies of the
     * read models a migration created empty.
     *
     * On by default for the same reason provisioning is: the platform offers
     * no step to hang the rebuild on, and a hand-run one was killed halfway on
     * 2026-09-09 by the deploy that replaced its container. Off is for a
     * server that cannot afford the rebuild right now and an operator who
     * will run it by hand.
     */
    SNAPSHOT_REFRESH_ON_BOOT: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(5000),
    DATABASE_POOL_MAX_WRITER: z.coerce.number().int().min(1).max(100).default(15),
    DATABASE_POOL_MAX_READER: z.coerce.number().int().min(1).max(100).default(30),
    DATABASE_POOL_MIN: z.coerce.number().int().min(0).max(20).default(0),
    DATABASE_POOL_ACQUIRE_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
    DATABASE_POOL_IDLE_MS: z.coerce.number().int().min(1000).max(300_000).default(10_000),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(15_000),
    // `agent_key` authenticates one hosted collector with a shared secret when
    // no identity provider exists. It grants the ingestion role alone; see ADR
    // 0016 for the boundary that makes a single long-lived credential tolerable.
    AUTH_MODE: z.enum(['disabled', 'jwks', 'agent_key']).default('disabled'),
    // Long enough that guessing is not a threat model. Never logged: Pino
    // redacts `req.headers.authorization`, which is where it travels.
    AGENT_INGESTION_KEY: optional(z.string().min(32)),
    AUTH_JWKS_URI: optional(z.string().url()),
    AUTH_ISSUER: optional(z.string().min(1)),
    AUTH_AUDIENCE: optional(z.string().min(1)),
    AUTH_ROLE_CLAIM: z.string().min(1).default('roles'),
    AUTH_ORGANIZATION_CLAIM: z.string().min(1).default('organization_id'),
    /**
     * The deployment an administrative answer describes.
     *
     * It is read here, from the server's own configuration, and never from a
     * request: a console that let the browser name its target would let anyone
     * aim a reconciliation at production by editing a form field.
     */
    ADMIN_ENVIRONMENT_ID: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]{0,59}$/)
      .default('local'),
    /**
     * Which classes of seed package this deployment is expected to carry.
     *
     * `metadata` is the floor every environment must reach before it admits the
     * operations that depend on those catalogues. `baseline` adds the technical
     * identities the product needs. `historical` adds the large corpora the
     * public report serves. Demo data is never in a profile; it needs its own
     * switch and is refused outright in production.
     */
    SEED_PROFILE: z.enum(['metadata', 'baseline', 'historical']).default('historical'),
    SEED_DEMO_ENABLED: booleanFromString,
    /**
     * A deliberate failure injected into a reconciliation, for tests only.
     *
     * Recovery is the part of this system that cannot be verified by reading
     * it: whether a crash before the commit leaves nothing behind, and whether
     * one after the commit leaves the data applied and its publication pending,
     * are claims that need the crash to actually happen. Production refuses the
     * variable outright, so the mechanism cannot be turned on where it would
     * matter.
     */
    SEED_FAULT_INJECTION: optional(z.enum(['before-commit', 'after-commit', 'before-publish'])),
    /** Seconds without a heartbeat after which a run is declared abandoned. */
    SEED_RUN_LEASE_SECONDS: z.coerce.number().int().min(30).max(86_400).default(900),
    /** Days of raw traffic events kept before the receiver prunes them. */
    ANALYTICS_RETENTION_DAYS: z.coerce.number().int().min(1).max(400).default(90),
    /** The commit this image was built from, injected by the build pipeline. */
    BUILD_COMMIT: optional(z.string().min(7).max(60)),
    /**
     * Whether this process checks the public site from outside itself.
     *
     * Off by default: only one replica should probe, and a deployment that has
     * an external monitor already does not need a second opinion from inside.
     */
    HEALTH_MONITOR_ENABLED: booleanFromString,
    HEALTH_MONITOR_TARGET_URL: optional(z.string().url()),
    HEALTH_MONITOR_INTERVAL_MS: z.coerce.number().int().min(5_000).max(3_600_000).default(60_000),
    HEALTH_MONITOR_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
    HEALTH_MONITOR_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(20).default(3),
    HEALTH_MONITOR_RECOVERY_THRESHOLD: z.coerce.number().int().min(1).max(20).default(2),
    /** Where an opened or closed incident is announced, when anywhere. */
    ALERT_WEBHOOK_URL: optional(z.string().url()),
    SWAGGER_ENABLED: booleanFromString,
    METRICS_ENABLED: booleanFromString,
    METRICS_SCRAPE_TOKEN: optional(z.string().min(24)),
    RATE_LIMIT_AGENT_MAX: z.coerce.number().int().min(1).max(100_000).default(1200),
    BACKUP_ENABLED: booleanFromString,
    BACKUP_STRATEGY: z.enum(['pg_dump', 'managed_pitr']).default('pg_dump'),
    BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
    BACKUP_DESTINATION: z.string().min(1).default('/backups'),
    BACKUP_ENCRYPTION_ENABLED: booleanFromString,
    BACKUP_COMPRESSION: z.enum(['none', 'gzip', 'custom']).default('custom'),
    BACKUP_MAX_DURATION_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
    // Tracing is opt-in: no existing process changes behaviour until it is enabled.
    OTEL_ENABLED: booleanFromString,
    OTEL_SERVICE_NAME: z.string().min(1).max(120).default('observatorio-economico-api'),
    OTEL_SERVICE_NAMESPACE: z.string().min(1).max(120).default('observatorio-economico'),
    OTEL_SERVICE_VERSION: z.string().min(1).max(40).default('1.0.0'),
    OTEL_DEPLOYMENT_ENVIRONMENT: optional(z.string().min(1).max(40)),
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().url().default('http://localhost:4318/v1/traces'),
    OTEL_EXPORT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),
    OTEL_TRACES_SAMPLER: z
      .enum([
        'always_on',
        'always_off',
        'traceidratio',
        'parentbased_always_on',
        'parentbased_always_off',
        'parentbased_traceidratio',
      ])
      .default('parentbased_traceidratio'),
    OTEL_TRACES_SAMPLER_ARG: z.coerce.number().min(0).max(1).default(1),
    // Read natively by the OpenTelemetry SDK; validated here so a typo fails at
    // startup instead of silently disabling context propagation.
    OTEL_PROPAGATORS: z
      .string()
      .regex(
        /^(tracecontext|baggage|b3|b3multi|jaeger|none)(,(tracecontext|baggage|b3|b3multi|jaeger|none))*$/,
      )
      .default('tracecontext,baggage'),
    OTEL_DIAG_LOG_LEVEL: z
      .enum(['NONE', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE', 'ALL'])
      .default('ERROR'),
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
    if (environment.NODE_ENV === 'production' && environment.SEED_DEMO_ENABLED) {
      context.addIssue({
        code: 'custom',
        path: ['SEED_DEMO_ENABLED'],
        message: 'Demo data is forbidden in production',
      });
    }
    if (environment.NODE_ENV === 'production' && environment.SEED_FAULT_INJECTION) {
      context.addIssue({
        code: 'custom',
        path: ['SEED_FAULT_INJECTION'],
        message: 'Fault injection is forbidden in production',
      });
    }
    if (environment.HEALTH_MONITOR_ENABLED && !environment.HEALTH_MONITOR_TARGET_URL) {
      context.addIssue({
        code: 'custom',
        path: ['HEALTH_MONITOR_TARGET_URL'],
        message: 'An external monitor needs the address it is supposed to check',
      });
    }
    if (environment.AUTH_MODE === 'agent_key' && !environment.AGENT_INGESTION_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['AGENT_INGESTION_KEY'],
        message: 'AUTH_MODE=agent_key requires a shared key of at least 32 characters',
      });
    }
    if (environment.AUTH_MODE === 'jwks') {
      for (const key of ['AUTH_JWKS_URI', 'AUTH_ISSUER', 'AUTH_AUDIENCE'] as const) {
        if (!environment[key]) {
          context.addIssue({ code: 'custom', path: [key], message: `${key} is required` });
        }
      }
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.METRICS_ENABLED &&
      !environment.METRICS_SCRAPE_TOKEN
    ) {
      context.addIssue({
        code: 'custom',
        path: ['METRICS_SCRAPE_TOKEN'],
        message: 'A scrape token is required when metrics are enabled in production',
      });
    }
    if (environment.NODE_ENV === 'production' && !environment.DATABASE_MIGRATOR_URL) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_MIGRATOR_URL'],
        message: 'A separate migrator credential is required in production',
      });
    }
  })
  // Resolved once, here, so every consumer reads a single listening port and no
  // caller has to remember which variable the current host happens to use.
  .transform((environment) => ({
    ...environment,
    APP_PORT: environment.PORT ?? environment.APP_PORT,
  }));

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
