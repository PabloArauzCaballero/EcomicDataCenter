// This module must be the first import of the process: OpenTelemetry patches
// modules as they are required, so anything loaded before it stays invisible.
import 'dotenv/config';
import { diag } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  type Sampler,
} from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { getEnvironment } from '../../config/environment';
import { createTelemetryConfig, type TelemetryConfig } from './telemetry.config';
import { createDiagnosticsLogger, toDiagnosticsLevel } from './telemetry.diagnostics';
import { createInstrumentations } from './telemetry.instrumentations';
import { isTelemetryRunning, registerTelemetrySdk } from './telemetry.shutdown';

const ATTR_SERVICE_NAMESPACE = 'service.namespace';
const ATTR_DEPLOYMENT_ENVIRONMENT_NAME = 'deployment.environment.name';

/** Builds the sampler named by configuration; no ratio is written in code. */
function createSampler(config: TelemetryConfig): Sampler {
  const ratio = new TraceIdRatioBasedSampler(config.samplerRatio);
  switch (config.samplerName) {
    case 'always_on':
      return new AlwaysOnSampler();
    case 'always_off':
      return new AlwaysOffSampler();
    case 'traceidratio':
      return ratio;
    case 'parentbased_always_on':
      return new ParentBasedSampler({ root: new AlwaysOnSampler() });
    case 'parentbased_always_off':
      return new ParentBasedSampler({ root: new AlwaysOffSampler() });
    default:
      // Honours the decision of whoever started the trace and samples only new
      // roots, so a sampled request never loses its downstream spans.
      return new ParentBasedSampler({ root: ratio });
  }
}

function createSdk(config: TelemetryConfig): NodeSDK {
  // OpenTelemetry is adopted for traces only: `prom-client` owns metrics and
  // Pino owns logs (ADR-0015). Left at its default the SDK also starts a metric
  // reader and a log exporter aimed at endpoints a tracing backend does not
  // serve, which fails on every interval and floods the diagnostics channel.
  // These are the documented configuration switches for those pipelines.
  process.env.OTEL_METRICS_EXPORTER = 'none';
  process.env.OTEL_LOGS_EXPORTER = 'none';
  const exporter = new OTLPTraceExporter({
    url: config.tracesEndpoint,
    timeoutMillis: config.exportTimeoutMs,
  });
  return new NodeSDK({
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: config.serviceName,
        [ATTR_SERVICE_VERSION]: config.serviceVersion,
        [ATTR_SERVICE_NAMESPACE]: config.serviceNamespace,
        [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.deploymentEnvironment,
      }),
    ),
    sampler: createSampler(config),
    // Batching keeps export off the request path: a slow or unreachable
    // collector costs queued spans, never a delayed response.
    spanProcessors: [new BatchSpanProcessor(exporter)],
    instrumentations: createInstrumentations(),
  });
}

/**
 * Starts tracing once, if it is enabled.
 *
 * A failure here must never stop the service: telemetry is a diagnostic aid,
 * not a business dependency. The error is reported on stderr and the process
 * continues with no-op spans.
 */
export function startTelemetry(): void {
  // A second call would register duplicate instrumentations and leak an
  // exporter; importing this module twice must be harmless.
  if (isTelemetryRunning()) return;
  const config = createTelemetryConfig(getEnvironment());
  if (!config.enabled) return;
  diag.setLogger(createDiagnosticsLogger(), toDiagnosticsLevel(config.diagnosticsLevel));
  try {
    const sdk = createSdk(config);
    sdk.start();
    registerTelemetrySdk(sdk);
    // Reported at info level so the runbook's first diagnostic step —
    // raising OTEL_DIAG_LOG_LEVEL — shows the effective configuration.
    diag.info(
      `Tracing started: service=${config.serviceName} endpoint=${config.tracesEndpoint} ` +
        `sampler=${config.samplerName} ratio=${String(config.samplerRatio)} ` +
        `propagators=${config.propagators.join('+')}`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        level: 'error',
        source: 'otel',
        message: `Tracing bootstrap failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      })}\n`,
    );
  }
}

startTelemetry();
