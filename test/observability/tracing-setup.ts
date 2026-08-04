import { startTestTelemetry } from './tracing-registry';

// Jest runs `setupFiles` before the test module is loaded, which is the only
// point where instrumentations can still patch Nest, Fastify and pg.
startTestTelemetry();
