import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { Transaction } from 'sequelize';
import { AuditLogModel } from '../../database/models';
import { toSafeErrorLog } from '../errors/error-logging';
import { MetricsService } from '../observability/metrics.service';
import { currentAuditState, markAuditedTransactionally } from './audit-context';
import { describeActor, type AuditEntry } from './audit-entry';

/** A sensitive action described by the service that performed it. */
export interface AuditAction {
  readonly action: string;
  readonly entityType: string;
  readonly entityReference?: string | undefined;
  readonly details?: Record<string, unknown> | undefined;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly metrics: MetricsService,
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Appends one entry, optionally inside a caller transaction.
   *
   * Callers that already own a transaction should pass it so the action and its
   * audit record commit together.
   */
  async record(entry: AuditEntry, transaction?: Transaction): Promise<void> {
    await AuditLogModel.create(
      {
        actorSubject: entry.actorSubject,
        actorRoles: entry.actorRoles,
        actorOrganizationId: entry.actorOrganizationId,
        action: entry.action,
        entityType: entry.entityType,
        entityReference: entry.entityReference,
        outcome: entry.outcome,
        correlationId: entry.correlationId,
        clientContext: entry.clientContext,
        detailsJson: entry.details,
        occurredAt: new Date(),
      },
      transaction ? { transaction } : {},
    );
    if (transaction) markAuditedTransactionally();
    this.metrics.observeAudit(entry.outcome, transaction ? 'committed' : 'recorded');
  }

  /**
   * Records an action atomically with the change it describes.
   *
   * Services call this inside their own transaction, so either both the change
   * and its trail commit or neither does. Outside an HTTP request there is no
   * ambient identity and the call is a no-op, which keeps CLI and seed paths
   * from inventing an actor.
   */
  async recordInTransaction(action: AuditAction, transaction: Transaction): Promise<void> {
    const state = currentAuditState();
    if (!state) return;
    await this.record(
      {
        ...describeActor(state.actor),
        action: action.action,
        entityType: action.entityType,
        entityReference: action.entityReference ?? null,
        outcome: 'SUCCESS',
        correlationId: state.correlationId,
        clientContext: state.clientContext,
        details: action.details ?? {},
      },
      transaction,
    );
  }

  /**
   * Appends an entry without letting an audit failure mask the business result.
   *
   * The mutation has already committed by the time the interceptor runs, so
   * raising here would report a false failure. The gap is made visible instead:
   * every miss increments `observatory_audit_entries_total{result="dropped"}`,
   * which operations must treat as an integrity incident.
   */
  async recordBestEffort(entry: AuditEntry): Promise<void> {
    try {
      await this.record(entry);
    } catch (error) {
      this.metrics.observeAudit(entry.outcome, 'dropped');
      this.logger.error(
        { error: toSafeErrorLog(error), action: entry.action, correlationId: entry.correlationId },
        'Audit entry could not be persisted',
      );
    }
  }
}
