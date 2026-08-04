import type { Environment } from '../../../config/environment';
import { createTelemetryConfig } from '../telemetry.config';
import { isTelemetryRunning, registerTelemetrySdk, shutdownTelemetry } from '../telemetry.shutdown';

function environmentWith(overrides: Partial<Environment>): Environment {
  return {
    NODE_ENV: 'production',
    OTEL_ENABLED: true,
    OTEL_SERVICE_NAME: 'observatorio-economico-api',
    OTEL_SERVICE_NAMESPACE: 'observatorio-economico',
    OTEL_SERVICE_VERSION: '1.0.0',
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://collector:4318/v1/traces',
    OTEL_EXPORT_TIMEOUT_MS: 10_000,
    OTEL_TRACES_SAMPLER: 'parentbased_traceidratio',
    OTEL_TRACES_SAMPLER_ARG: 0.1,
    OTEL_PROPAGATORS: 'tracecontext,baggage',
    OTEL_DIAG_LOG_LEVEL: 'ERROR',
    ...overrides,
  } as Environment;
}

describe('createTelemetryConfig', () => {
  it('projects the validated environment', () => {
    const config = createTelemetryConfig(environmentWith({}));

    expect(config).toMatchObject({
      enabled: true,
      serviceName: 'observatorio-economico-api',
      tracesEndpoint: 'http://collector:4318/v1/traces',
      samplerName: 'parentbased_traceidratio',
      samplerRatio: 0.1,
    });
    expect(config.propagators).toEqual(['tracecontext', 'baggage']);
  });

  it('falls back to NODE_ENV so a trace always names its environment', () => {
    expect(createTelemetryConfig(environmentWith({})).deploymentEnvironment).toBe('production');
    expect(
      createTelemetryConfig(environmentWith({ OTEL_DEPLOYMENT_ENVIRONMENT: 'staging' }))
        .deploymentEnvironment,
    ).toBe('staging');
  });

  it('reports tracing as disabled when the flag is off', () => {
    expect(createTelemetryConfig(environmentWith({ OTEL_ENABLED: false })).enabled).toBe(false);
  });
});

describe('telemetry shutdown registry', () => {
  afterEach(async () => shutdownTelemetry());

  it('reports no running SDK before one is registered', async () => {
    await shutdownTelemetry();
    expect(isTelemetryRunning()).toBe(false);
  });

  it('closes the registered SDK exactly once', async () => {
    const shutdown = jest.fn().mockResolvedValue(undefined);
    registerTelemetrySdk({ shutdown });

    expect(isTelemetryRunning()).toBe(true);
    await shutdownTelemetry();
    await shutdownTelemetry();

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(isTelemetryRunning()).toBe(false);
  });

  it('propagates a shutdown failure instead of hiding lost spans', async () => {
    registerTelemetrySdk({ shutdown: () => Promise.reject(new Error('exporter closed')) });

    await expect(shutdownTelemetry()).rejects.toThrow('exporter closed');
  });
});
