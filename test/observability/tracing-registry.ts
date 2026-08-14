import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { createInstrumentations } from '../../src/common/observability/telemetry.instrumentations';

/** Collects the spans produced during an end-to-end run. */
export const spanExporter = new InMemorySpanExporter();

const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(spanExporter)],
});

/**
 * Registers the same instrumentations the process registers at boot.
 *
 * It must run before Nest, Fastify or pg are loaded, which is why it is wired
 * as a Jest `setupFiles` entry rather than called from a test body.
 */
export function startTestTelemetry(): void {
  provider.register();
  registerInstrumentations({ instrumentations: createInstrumentations() });
}

/** Flushes and releases the test provider. */
export async function stopTestTelemetry(): Promise<void> {
  await provider.shutdown();
}
