import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

/** A tracer provider that keeps finished spans in memory for assertions. */
export interface TracingHarness {
  readonly exporter: InMemorySpanExporter;
  shutdown(): Promise<void>;
}

/**
 * Registers a real tracer provider backed by an in-memory exporter.
 *
 * The unit tests exercise the same OpenTelemetry API the application uses, so
 * they verify actual span behaviour — parents, attributes, status — instead of
 * asserting that a mock was called. No collector and no Jaeger are involved.
 */
export function startTracingHarness(): TracingHarness {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  provider.register();
  return {
    exporter,
    shutdown: async () => {
      await provider.shutdown();
    },
  };
}
