import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { toSafeErrorLog } from '../errors/error-logging';

export type IngestionStage =
  'COLLECTION' | 'VALIDATION' | 'DELIVERY' | 'PERSISTENCE' | 'REVIEW' | 'PUBLICATION';

export type IngestionOutcome = 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'NO_CHANGES' | 'SKIPPED';

export interface IngestionEvent {
  readonly correlationId: string;
  readonly agentRunId?: string | null;
  readonly sourceId?: string | null;
  readonly stage: IngestionStage;
  readonly outcome: IngestionOutcome;
  readonly occurredAt?: Date;
  readonly durationMs?: number | null;
  readonly artifactReference?: string | null;
  readonly artifactSha256?: string | null;
  readonly recordsReceived?: number;
  readonly recordsAccepted?: number;
  readonly recordsRejected?: number;
  readonly recordsSkipped?: number;
  readonly reason?: string | null;
  readonly details?: Readonly<Record<string, unknown>> | null;
}

/**
 * Writes down what happened at one stage of one ingestion, and only that.
 *
 * It lives in `common` because the stages belong to different modules — the
 * collector opens a run, the batch importer validates and persists, the seed
 * runner publishes — and a register that only one of them could write to would
 * record one stage and infer the rest. Inferring is the failure this exists to
 * end: a workflow that went green proved that a script exited zero, never that
 * a figure reached a reader.
 *
 * Counters are per stage and mutually exclusive within it. `recordsAccepted`
 * at VALIDATION and at PERSISTENCE describe the same items at two moments, and
 * adding them would double-count; the portal presents them as stages, never as
 * a sum.
 *
 * Recording is best effort on purpose. Telemetry that can fail an ingestion is
 * worse than missing telemetry: the observation is the thing the observatory
 * exists for, and a failed insert here is visible as an absent stage rather
 * than as a lost figure.
 */
@Injectable()
export class IngestionEventRecorder {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    private readonly logger: PinoLogger,
  ) {}

  async record(event: IngestionEvent, transaction?: Transaction): Promise<void> {
    try {
      await this.writer.query(
        `INSERT INTO operations.ingestion_event (
           correlation_id, agent_run_id, source_id, stage, outcome, occurred_at,
           duration_ms, artifact_reference, artifact_sha256,
           records_received, records_accepted, records_rejected, records_skipped,
           reason, details_json
         ) VALUES (
           :correlationId, :agentRunId, :sourceId, :stage, :outcome, :occurredAt,
           :durationMs, :artifactReference, :artifactSha256,
           :recordsReceived, :recordsAccepted, :recordsRejected, :recordsSkipped,
           :reason, CAST(:details AS jsonb)
         )`,
        {
          type: QueryTypes.INSERT,
          ...(transaction ? { transaction } : {}),
          replacements: {
            correlationId: event.correlationId,
            agentRunId: event.agentRunId ?? null,
            sourceId: event.sourceId ?? null,
            stage: event.stage,
            outcome: event.outcome,
            occurredAt: event.occurredAt ?? new Date(),
            durationMs: event.durationMs ?? null,
            artifactReference: event.artifactReference ?? null,
            artifactSha256: event.artifactSha256 ?? null,
            recordsReceived: event.recordsReceived ?? 0,
            recordsAccepted: event.recordsAccepted ?? 0,
            recordsRejected: event.recordsRejected ?? 0,
            recordsSkipped: event.recordsSkipped ?? 0,
            reason: event.reason ?? null,
            details: event.details ? JSON.stringify(event.details) : null,
          },
        },
      );
    } catch (error) {
      this.logger.warn(
        { error: toSafeErrorLog(error), stage: event.stage },
        'Ingestion event was not recorded',
      );
    }
  }
}
