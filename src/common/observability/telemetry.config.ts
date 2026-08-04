import type { Environment } from '../../config/environment';

/** Sampling strategies accepted by the tracing bootstrap. */
export type TelemetrySamplerName = Environment['OTEL_TRACES_SAMPLER'];

/** Immutable tracing configuration derived from the validated environment. */
export interface TelemetryConfig {
  readonly enabled: boolean;
  readonly serviceName: string;
  readonly serviceNamespace: string;
  readonly serviceVersion: string;
  readonly deploymentEnvironment: string;
  readonly tracesEndpoint: string;
  readonly exportTimeoutMs: number;
  readonly samplerName: TelemetrySamplerName;
  readonly samplerRatio: number;
  readonly propagators: readonly string[];
  readonly diagnosticsLevel: Environment['OTEL_DIAG_LOG_LEVEL'];
}

/**
 * Projects the validated environment onto the tracing configuration.
 *
 * The bootstrap runs before Nest exists, so it cannot resolve configuration
 * through dependency injection; taking the already-parsed environment as an
 * argument keeps `process.env` out of every module but this projection.
 */
export function createTelemetryConfig(environment: Environment): TelemetryConfig {
  return Object.freeze({
    enabled: environment.OTEL_ENABLED,
    serviceName: environment.OTEL_SERVICE_NAME,
    serviceNamespace: environment.OTEL_SERVICE_NAMESPACE,
    serviceVersion: environment.OTEL_SERVICE_VERSION,
    // The deployment label defaults to NODE_ENV so a deployment can never
    // report traces without saying which environment produced them.
    deploymentEnvironment: environment.OTEL_DEPLOYMENT_ENVIRONMENT ?? environment.NODE_ENV,
    tracesEndpoint: environment.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    exportTimeoutMs: environment.OTEL_EXPORT_TIMEOUT_MS,
    samplerName: environment.OTEL_TRACES_SAMPLER,
    samplerRatio: environment.OTEL_TRACES_SAMPLER_ARG,
    propagators: Object.freeze(
      environment.OTEL_PROPAGATORS.split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    ),
    diagnosticsLevel: environment.OTEL_DIAG_LOG_LEVEL,
  });
}
