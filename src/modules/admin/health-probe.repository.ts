import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';

export type ProbeOutcome = 'UP' | 'DOWN' | 'UNKNOWN';

export interface ProbeRecord {
  readonly target: string;
  readonly probeType: 'HTTP' | 'JOURNEY' | 'DATASET';
  readonly outcome: ProbeOutcome;
  readonly durationMs: number | null;
  readonly evidence: Readonly<Record<string, unknown>> | null;
  readonly errorSummary: string | null;
}

export interface OpenIncident {
  readonly healthIncidentId: string;
  readonly consecutiveFailures: number;
  readonly openedAt: Date;
}

/**
 * Writes down each check and the incident a run of failures opens.
 *
 * One incident per outage, not one per probe. A monitor that checks every
 * minute during a two-hour outage has a hundred and twenty pieces of evidence
 * and one thing to tell somebody, and conflating those is how an alert channel
 * becomes noise that gets muted before the next real outage.
 */
@Injectable()
export class HealthProbeRepository {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  async recordProbe(probe: ProbeRecord): Promise<void> {
    await this.writer.query(
      `INSERT INTO operations.health_probe (
         target, probe_type, observed_at, duration_ms, outcome, evidence_json, error_summary
       ) VALUES (
         :target, :probeType, now(), :durationMs, :outcome, CAST(:evidence AS jsonb), :errorSummary
       )`,
      {
        type: QueryTypes.INSERT,
        replacements: {
          target: probe.target,
          probeType: probe.probeType,
          durationMs: probe.durationMs,
          outcome: probe.outcome,
          evidence: probe.evidence ? JSON.stringify(probe.evidence) : null,
          errorSummary: probe.errorSummary?.slice(0, 300) ?? null,
        },
      },
    );
  }

  /**
   * The most recent outcomes for a target, newest first.
   *
   * Read through the writer rather than the reader because the decision it
   * feeds is part of the same command that just recorded a probe: a reader
   * snapshot taken a moment earlier could miss that probe and reopen an
   * incident that was about to close.
   */
  async recentOutcomes(target: string, limit: number): Promise<ProbeOutcome[]> {
    const rows = await this.writer.query<{ outcome: ProbeOutcome }>(
      `SELECT outcome FROM operations.health_probe
        WHERE target = :target
        ORDER BY observed_at DESC, health_probe_id DESC
        LIMIT :limit`,
      { type: QueryTypes.SELECT, replacements: { target, limit } },
    );
    return rows.map((row) => row.outcome);
  }

  async findOpenIncident(target: string): Promise<OpenIncident | null> {
    const rows = await this.writer.query<{
      health_incident_id: string;
      consecutive_failures: number;
      opened_at: Date;
    }>(
      `SELECT health_incident_id, consecutive_failures, opened_at
         FROM operations.health_incident
        WHERE target = :target AND status = 'OPEN'
        ORDER BY opened_at DESC
        LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { target } },
    );
    const row = rows[0];
    return row
      ? {
          healthIncidentId: row.health_incident_id,
          consecutiveFailures: row.consecutive_failures,
          openedAt: row.opened_at,
        }
      : null;
  }

  /** Opens an incident, or returns the one already open for this target. */
  async openIncident(
    target: string,
    cause: string,
    consecutiveFailures: number,
  ): Promise<{ healthIncidentId: string; created: boolean }> {
    const existing = await this.findOpenIncident(target);
    if (existing) {
      await this.writer.query(
        `UPDATE operations.health_incident
            SET consecutive_failures = :consecutiveFailures
          WHERE health_incident_id = :id`,
        {
          type: QueryTypes.UPDATE,
          replacements: { id: existing.healthIncidentId, consecutiveFailures },
        },
      );
      return { healthIncidentId: existing.healthIncidentId, created: false };
    }
    const healthIncidentId = randomUUID();
    await this.writer.query(
      `INSERT INTO operations.health_incident (
         health_incident_id, target, status, cause, consecutive_failures, opened_at
       ) VALUES (:id, :target, 'OPEN', :cause, :consecutiveFailures, now())`,
      {
        type: QueryTypes.INSERT,
        replacements: {
          id: healthIncidentId,
          target,
          cause: cause.slice(0, 200),
          consecutiveFailures,
        },
      },
    );
    return { healthIncidentId, created: true };
  }

  async closeIncident(healthIncidentId: string): Promise<void> {
    await this.writer.query(
      `UPDATE operations.health_incident
          SET status = 'CLOSED', closed_at = now()
        WHERE health_incident_id = :id AND status = 'OPEN'`,
      { type: QueryTypes.UPDATE, replacements: { id: healthIncidentId } },
    );
  }

  /**
   * Records one delivery attempt, once per incident, channel and attempt.
   *
   * The unique key is what stops a probe loop from announcing the same outage
   * every minute: the second attempt with the same deduplication key and the
   * same number is not inserted, and the caller learns it was already sent.
   */
  async recordDelivery(delivery: {
    healthIncidentId: string | null;
    ruleCode: string;
    dedupKey: string;
    channel: string;
    attemptNo: number;
    status: 'PENDING' | 'DELIVERED' | 'FAILED' | 'SUPPRESSED';
    errorSummary: string | null;
  }): Promise<boolean> {
    const rows = await this.writer.query<{ alert_delivery_id: string }>(
      `INSERT INTO operations.alert_delivery (
         health_incident_id, rule_code, dedup_key, channel, attempt_no, status,
         dispatched_at, error_summary
       ) VALUES (
         :healthIncidentId, :ruleCode, :dedupKey, :channel, :attemptNo, :status,
         now(), :errorSummary
       )
       ON CONFLICT ON CONSTRAINT uq_alert_delivery_attempt DO NOTHING
       RETURNING alert_delivery_id::text AS alert_delivery_id`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          healthIncidentId: delivery.healthIncidentId,
          ruleCode: delivery.ruleCode,
          dedupKey: delivery.dedupKey.slice(0, 160),
          channel: delivery.channel,
          attemptNo: delivery.attemptNo,
          status: delivery.status,
          errorSummary: delivery.errorSummary?.slice(0, 300) ?? null,
        },
      },
    );
    return rows.length > 0;
  }
}
