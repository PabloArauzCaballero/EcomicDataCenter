import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { toSafeErrorLog } from '../../common/errors/error-logging';
import { ENVIRONMENT } from '../../config/configuration.module';
import type { Environment } from '../../config/environment';
import { SiteAvailabilityService } from './site-availability.service';

/**
 * Checks the public site from outside the process that serves it.
 *
 * «Outside» is doing real work here. A readiness endpoint answers whether this
 * process believes it is healthy, which it cannot answer honestly when it is
 * the thing that is wrong. An HTTP request to the published address goes
 * through whatever sits in front of it — the proxy, the tunnel, the certificate
 * — and every one of those has taken the site down at least once without the
 * application noticing.
 *
 * It is off by default and it is one timer, not a service. A deployment with a
 * real external monitor should keep this off; a deployment with none gets a
 * check that at least crosses the network boundary. Only one replica should
 * ever have it on, and the incident register is what makes a second one
 * harmless rather than noisy.
 */
@Injectable()
export class ExternalCheckScheduler implements OnModuleInit, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly availability: SiteAvailabilityService,
    private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    if (!this.environment.HEALTH_MONITOR_ENABLED) return;
    this.timer = setInterval(() => void this.check(), this.environment.HEALTH_MONITOR_INTERVAL_MS);
    // Never holds the event loop open: a shutdown signal is honoured at once
    // rather than after the next check.
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * One check, which can only ever produce a probe — never an exception.
   *
   * A check that itself failed to run is `UNKNOWN`, not `DOWN`. Recording a
   * monitor's own bug as an outage of the thing it watches is how a register
   * stops being believed.
   */
  async check(): Promise<void> {
    if (this.stopped) return;
    const target = this.environment.HEALTH_MONITOR_TARGET_URL;
    if (!target) return;
    const startedAt = Date.now();
    try {
      const response = await fetch(target, {
        redirect: 'manual',
        signal: AbortSignal.timeout(this.environment.HEALTH_MONITOR_TIMEOUT_MS),
      });
      await this.availability.recordAndEvaluate({
        target: 'public-site',
        probeType: 'HTTP',
        outcome: response.ok ? 'UP' : 'DOWN',
        durationMs: Date.now() - startedAt,
        evidence: { status: response.status },
        errorSummary: response.ok ? null : `HTTP ${response.status}`,
      });
    } catch (error) {
      if (this.stopped) return;
      this.logger.warn({ error: toSafeErrorLog(error) }, 'External site check failed');
      await this.availability
        .recordAndEvaluate({
          target: 'public-site',
          probeType: 'HTTP',
          outcome: 'DOWN',
          durationMs: Date.now() - startedAt,
          evidence: null,
          errorSummary: error instanceof Error ? error.message : 'comprobación fallida',
        })
        .catch(() => undefined);
    }
  }
}
