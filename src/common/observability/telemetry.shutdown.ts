/** Minimal surface the shutdown registry needs from the tracing SDK. */
interface ShutdownCapableSdk {
  shutdown(): Promise<void>;
}

let activeSdk: ShutdownCapableSdk | undefined;

/**
 * Records the running SDK so the application lifecycle can close it.
 *
 * Keeping the handle here instead of exporting it from the bootstrap lets the
 * shutdown path be imported by Nest providers without re-executing the
 * side-effectful bootstrap module.
 */
export function registerTelemetrySdk(sdk: ShutdownCapableSdk): void {
  activeSdk = sdk;
}

/** True when a tracing SDK is running in this process. */
export function isTelemetryRunning(): boolean {
  return activeSdk !== undefined;
}

/**
 * Flushes pending spans and releases the exporter.
 *
 * Idempotent: the handle is cleared before awaiting, so a second call during a
 * retried shutdown resolves immediately instead of closing an exporter twice.
 * Errors are propagated rather than swallowed — losing telemetry on shutdown is
 * a real fault, and the caller decides whether it should block termination.
 */
export async function shutdownTelemetry(): Promise<void> {
  const sdk = activeSdk;
  activeSdk = undefined;
  if (!sdk) return;
  await sdk.shutdown();
}
