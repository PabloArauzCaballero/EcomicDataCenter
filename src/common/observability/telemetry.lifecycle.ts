import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { toSafeErrorLog } from '../errors/error-logging';
import { isTelemetryRunning, shutdownTelemetry } from './telemetry.shutdown';

/**
 * Closes the tracing SDK as part of the application shutdown sequence.
 *
 * The process already registers `SIGINT` and `SIGTERM` through Nest shutdown
 * hooks (`src/main.ts`). Adding signal handlers here would race with them; a
 * lifecycle provider instead runs after controllers and pools are closed, which
 * is when the last spans have been produced and can be flushed.
 */
@Injectable()
export class TelemetryLifecycle implements OnApplicationShutdown {
  constructor(private readonly logger: PinoLogger) {}

  async onApplicationShutdown(): Promise<void> {
    if (!isTelemetryRunning()) return;
    try {
      await shutdownTelemetry();
    } catch (error) {
      // Losing buffered spans must not turn a clean shutdown into a crash, but
      // it is a real fault and has to be visible.
      this.logger.warn({ error: toSafeErrorLog(error) }, 'Tracing shutdown failed');
    }
  }
}
