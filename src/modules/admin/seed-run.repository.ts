import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';

export interface SeedRunRecord {
  readonly seedRunId: string;
  readonly packageCode: string;
  readonly packageVersion: string;
  readonly operation: 'VALIDATION' | 'RECONCILIATION';
  readonly status: string;
  readonly attemptNo: number;
  readonly startedAt: Date;
  readonly heartbeatAt: Date;
  readonly completedAt: Date | null;
  readonly errorSummary: string | null;
  readonly checkpoint: Readonly<Record<string, unknown>> | null;
  readonly counters: Readonly<Record<string, unknown>>;
}

interface RunRow {
  seed_run_id: string;
  package_code: string;
  package_version: string;
  operation: 'VALIDATION' | 'RECONCILIATION';
  status: string;
  attempt_no: number;
  started_at: Date;
  heartbeat_at: Date;
  completed_at: Date | null;
  error_summary: string | null;
  checkpoint_json: Record<string, unknown> | null;
  counters_json: Record<string, unknown>;
}

function toRun(row: RunRow): SeedRunRecord {
  return {
    seedRunId: row.seed_run_id,
    packageCode: row.package_code,
    packageVersion: row.package_version,
    operation: row.operation,
    status: row.status,
    attemptNo: row.attempt_no,
    startedAt: row.started_at,
    heartbeatAt: row.heartbeat_at,
    completedAt: row.completed_at,
    errorSummary: row.error_summary,
    checkpoint: row.checkpoint_json,
    counters: row.counters_json,
  };
}

/**
 * The life of one seed execution, from accepted to finished or abandoned.
 *
 * It is separate from the ledger of applications because the two answer
 * different questions and have different lifetimes: the ledger says what this
 * database carries and is meant to be permanent, while a run says what somebody
 * asked for and how far it got.
 */
@Injectable()
export class SeedRunRepository {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  /**
   * Opens a run, or returns the one an identical request already opened.
   *
   * Idempotency lives in the database, not in the browser: disabling a button
   * stops the second click, and nothing stops the second tab. The fingerprint
   * covers what the operator asked for, so the same ask twice yields one run.
   *
   * `created` is what the insert itself reported, not a comparison made after
   * it. Two requests that arrive together both find the row a moment later and
   * would both believe they opened it; only one of them gets a row back from
   * `RETURNING`, and only that one starts the work.
   */
  async openRun(input: {
    seedRunId: string;
    packageCode: string;
    packageVersion: string;
    operation: 'VALIDATION' | 'RECONCILIATION';
    actorSubject: string;
    environmentId: string;
    databaseIdentity: string;
    requestFingerprint: string;
    attemptNo?: number;
  }): Promise<{ run: SeedRunRecord; created: boolean }> {
    const now = new Date();
    const inserted = await this.writer.query<{ seed_run_id: string }>(
      `INSERT INTO operations.seed_run (
         seed_run_id, package_code, package_version, operation, attempt_no,
         actor_subject, environment_id, database_identity, status,
         request_fingerprint, started_at, heartbeat_at, counters_json
       ) VALUES (
         :seedRunId, :packageCode, :packageVersion, :operation, :attemptNo,
         :actorSubject, :environmentId, :databaseIdentity, 'QUEUED',
         :requestFingerprint, :now, :now, '{}'::jsonb
       )
       ON CONFLICT (request_fingerprint) DO NOTHING
       RETURNING seed_run_id`,
      {
        type: QueryTypes.SELECT,
        replacements: { ...input, attemptNo: input.attemptNo ?? 1, now },
      },
    );
    const existing = await this.findByFingerprint(input.requestFingerprint);
    if (!existing) throw new Error('El registro de la ejecución no quedó grabado');
    return { run: existing, created: inserted.length > 0 };
  }

  async findByFingerprint(requestFingerprint: string): Promise<SeedRunRecord | null> {
    const rows = await this.writer.query<RunRow>(
      `SELECT * FROM operations.seed_run WHERE request_fingerprint = :requestFingerprint`,
      { type: QueryTypes.SELECT, replacements: { requestFingerprint } },
    );
    const row = rows[0];
    return row ? toRun(row) : null;
  }

  async findRun(seedRunId: string): Promise<SeedRunRecord | null> {
    const rows = await this.writer.query<RunRow>(
      `SELECT * FROM operations.seed_run WHERE seed_run_id = :seedRunId`,
      { type: QueryTypes.SELECT, replacements: { seedRunId } },
    );
    const row = rows[0];
    return row ? toRun(row) : null;
  }

  /**
   * The progress a previous attempt at this package left behind, if any.
   *
   * A retry that started from nothing would replay steps that already
   * committed. They are idempotent, so nothing would break — but a corpus whose
   * sixth step failed would spend the cost of the first five again on every
   * attempt, which is how a resumable load stops being resumable in practice.
   *
   * Only a run that stopped **mid-way** leaves progress worth inheriting, and
   * that is exactly `FAILED` and `ABANDONED`. `PARTIAL` is not one of them: its
   * steps all ran and only the publication did not, so inheriting its checkpoint
   * would give the next run an empty list of pending steps and turn a
   * deliberate re-application into a silent no-op — which is how a repair that
   * reported success left a hand-edited row exactly as it was.
   */
  async lastCheckpoint(
    databaseIdentity: string,
    packageCode: string,
    packageVersion: string,
  ): Promise<Readonly<Record<string, unknown>> | null> {
    const rows = await this.writer.query<{ checkpoint_json: Record<string, unknown> | null }>(
      `SELECT checkpoint_json FROM operations.seed_run
        WHERE database_identity = :databaseIdentity
          AND package_code = :packageCode
          AND package_version = :packageVersion
          AND operation = 'RECONCILIATION'
          AND status IN ('FAILED', 'ABANDONED')
          AND checkpoint_json IS NOT NULL
        ORDER BY started_at DESC
        LIMIT 1`,
      {
        type: QueryTypes.SELECT,
        replacements: { databaseIdentity, packageCode, packageVersion },
      },
    );
    return rows[0]?.checkpoint_json ?? null;
  }

  /**
   * Moves a run forward, always touching the heartbeat.
   *
   * The heartbeat is what separates «a large load still working» from «a
   * process that died holding the run open»: duration alone cannot tell them
   * apart, and the corpora take minutes on purpose.
   */
  async updateRun(
    seedRunId: string,
    update: {
      status: string;
      errorSummary?: string | null;
      checkpoint?: Readonly<Record<string, unknown>> | null;
      counters?: Readonly<Record<string, unknown>>;
      completed?: boolean;
    },
    transaction?: Transaction,
  ): Promise<void> {
    await this.writer.query(
      `UPDATE operations.seed_run
          SET status = :status,
              heartbeat_at = now(),
              completed_at = CASE WHEN :completed THEN now() ELSE completed_at END,
              error_summary = COALESCE(CAST(:errorSummary AS varchar(500)), error_summary),
              checkpoint_json = COALESCE(CAST(:checkpoint AS jsonb), checkpoint_json),
              counters_json = COALESCE(CAST(:counters AS jsonb), counters_json)
        WHERE seed_run_id = :seedRunId`,
      {
        type: QueryTypes.UPDATE,
        ...(transaction ? { transaction } : {}),
        replacements: {
          seedRunId,
          status: update.status,
          completed: update.completed ?? false,
          errorSummary: update.errorSummary ?? null,
          checkpoint: update.checkpoint ? JSON.stringify(update.checkpoint) : null,
          counters: update.counters ? JSON.stringify(update.counters) : null,
        },
      },
    );
  }

  /**
   * Declares dead the runs whose heartbeat stopped, and only those.
   *
   * A run is abandoned when nothing has touched it for longer than the lease,
   * never because it has been going for a long time. The distinction is the
   * whole reason the heartbeat exists.
   */
  async abandonStaleRuns(leaseSeconds: number): Promise<number> {
    const rows = await this.writer.query<{ seed_run_id: string }>(
      `UPDATE operations.seed_run
          SET status = 'ABANDONED',
              completed_at = now(),
              error_summary = COALESCE(error_summary, 'Sin latido durante el arrendamiento')
        WHERE status IN ('QUEUED', 'RUNNING')
          AND heartbeat_at < now() - make_interval(secs => :leaseSeconds)
        RETURNING seed_run_id`,
      { type: QueryTypes.SELECT, replacements: { leaseSeconds } },
    );
    return rows.length;
  }
}
