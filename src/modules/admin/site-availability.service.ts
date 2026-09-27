import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { toSafeErrorLog } from '../../common/errors/error-logging';
import { ENVIRONMENT } from '../../config/configuration.module';
import type { Environment } from '../../config/environment';
import { HealthProbeRepository, type ProbeRecord } from './health-probe.repository';

export interface AvailabilityDecision {
  readonly incidentOpened: boolean;
  readonly incidentClosed: boolean;
  readonly healthIncidentId: string | null;
  readonly notified: boolean;
}

/**
 * Turns a run of checks into at most one incident, and one announcement.
 *
 * The thresholds are what separate an outage from a blip: an incident opens on
 * a run of consecutive failures and closes on a run of consecutive successes,
 * and both runs are read back from the register rather than kept in memory, so
 * a process that restarts mid-outage does not start the count again.
 *
 * A probe that could not be taken at all is `UNKNOWN`, and `UNKNOWN` never
 * closes an incident and never opens one. That is the whole point: a monitor
 * that is down produces no evidence, and no evidence is not «the site is
 * fine» — which is exactly what a zero in an error counter would have said.
 */
@Injectable()
export class SiteAvailabilityService {
  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly probes: HealthProbeRepository,
    private readonly logger: PinoLogger,
  ) {}

  async recordAndEvaluate(probe: ProbeRecord): Promise<AvailabilityDecision> {
    await this.probes.recordProbe(probe);
    const failureThreshold = this.environment.HEALTH_MONITOR_FAILURE_THRESHOLD;
    const recoveryThreshold = this.environment.HEALTH_MONITOR_RECOVERY_THRESHOLD;
    const recent = await this.probes.recentOutcomes(
      probe.target,
      Math.max(failureThreshold, recoveryThreshold),
    );
    const open = await this.probes.findOpenIncident(probe.target);

    const failing = leadingRun(recent, 'DOWN');
    const recovering = leadingRun(recent, 'UP');

    if (!open && failing >= failureThreshold) {
      const incident = await this.probes.openIncident(
        probe.target,
        probe.errorSummary ?? 'Comprobación externa fallida',
        failing,
      );
      const notified = await this.announce(
        incident.healthIncidentId,
        probe.target,
        'site-down',
        'opened',
      );
      return {
        incidentOpened: incident.created,
        incidentClosed: false,
        healthIncidentId: incident.healthIncidentId,
        notified,
      };
    }

    if (open && recovering >= recoveryThreshold) {
      await this.probes.closeIncident(open.healthIncidentId);
      const notified = await this.announce(
        open.healthIncidentId,
        probe.target,
        'site-down',
        'closed',
      );
      return {
        incidentOpened: false,
        incidentClosed: true,
        healthIncidentId: open.healthIncidentId,
        notified,
      };
    }

    if (open && probe.outcome === 'DOWN') {
      await this.probes.openIncident(probe.target, open ? 'Sigue caído' : '', failing);
    }
    return {
      incidentOpened: false,
      incidentClosed: false,
      healthIncidentId: open?.healthIncidentId ?? null,
      notified: false,
    };
  }

  /**
   * Announces a transition once, and records the attempt whether it worked.
   *
   * The deduplication key is the incident and the transition, so the same
   * opening cannot be announced twice however many probes observe it. Delivery
   * and incident are separate states on purpose: a webhook that is refusing
   * connections is a delivery problem, and reporting it as «no incident» would
   * be the second outage hiding the first.
   */
  private async announce(
    healthIncidentId: string,
    target: string,
    ruleCode: string,
    transition: 'opened' | 'closed',
  ): Promise<boolean> {
    const dedupKey = `${healthIncidentId}:${transition}`;
    const first = await this.probes.recordDelivery({
      healthIncidentId,
      ruleCode,
      dedupKey,
      channel: 'webhook',
      attemptNo: 1,
      status: this.environment.ALERT_WEBHOOK_URL ? 'PENDING' : 'SUPPRESSED',
      errorSummary: this.environment.ALERT_WEBHOOK_URL ? null : 'Sin canal configurado',
    });
    if (!first || !this.environment.ALERT_WEBHOOK_URL) return false;
    try {
      const response = await fetch(this.environment.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ incident: healthIncidentId, target, rule: ruleCode, transition }),
        signal: AbortSignal.timeout(this.environment.HEALTH_MONITOR_TIMEOUT_MS),
      });
      await this.probes.recordDelivery({
        healthIncidentId,
        ruleCode,
        dedupKey,
        channel: 'webhook',
        attemptNo: 2,
        status: response.ok ? 'DELIVERED' : 'FAILED',
        errorSummary: response.ok ? null : `HTTP ${response.status}`,
      });
      return response.ok;
    } catch (error) {
      this.logger.warn({ error: toSafeErrorLog(error) }, 'Alert delivery failed');
      await this.probes.recordDelivery({
        healthIncidentId,
        ruleCode,
        dedupKey,
        channel: 'webhook',
        attemptNo: 2,
        status: 'FAILED',
        errorSummary: error instanceof Error ? error.message : 'entrega fallida',
      });
      return false;
    }
  }
}

/** How many of the most recent outcomes, uninterrupted, are this one. */
function leadingRun(outcomes: readonly string[], wanted: string): number {
  let count = 0;
  for (const outcome of outcomes) {
    if (outcome !== wanted) break;
    count += 1;
  }
  return count;
}
