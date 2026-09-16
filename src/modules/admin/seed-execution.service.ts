import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { QueryTypes, type Sequelize } from 'sequelize';
import type { Actor } from '../../common/auth/actor';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/application.error';
import { toSafeErrorLog } from '../../common/errors/error-logging';
import { ENVIRONMENT } from '../../config/configuration.module';
import type { Environment } from '../../config/environment';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { SEED_PACKAGES } from '../../database/seeds/manifest';
import { planOrder, resolvePackage } from '../../database/seeds/manifest-resolution';
import { DeploymentIdentity } from './deployment-identity';
import { SeedContextProvider } from './seed-context.provider';
import { SeedLedgerRepository } from './seed-ledger.repository';
import { SeedRunRepository, type SeedRunRecord } from './seed-run.repository';
import { withSeedLock } from './seed-lock';
import { SEED_UNITS, type SeedUnit } from './seed-package.runner';
import { SeedPublicationService } from './seed-publication.service';
import { refuseSeed, type SeedRefusal } from './seed-policy';

const TERMINAL = ['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED', 'ABANDONED'];

interface Checkpoint {
  completed?: readonly string[];
}

function refusalToError(refusal: SeedRefusal): Error {
  if (refusal.code === 'VERSION_CONFLICT' || refusal.code === 'CHECKSUM_CONFLICT') {
    return new ConflictError(refusal.message, { reason: refusal.code });
  }
  return new BusinessRuleError(refusal.message, {
    reason: refusal.code,
    ...('details' in refusal ? { details: refusal.details } : {}),
  });
}

/**
 * Applies seed packages under an operator's authority, durably.
 *
 * Four rules it exists to enforce. Nothing is written before the package, its
 * dependencies, the deployment profile and the schema version have all been
 * checked. The same request twice yields one run. Every step commits with the
 * checkpoint that records it, and the ledger entry commits with the rows it
 * describes. And publication is measured after the commit rather than inferred
 * from it, so «applied» and «published» can disagree out loud.
 */
@Injectable()
export class SeedExecutionService {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly identity: DeploymentIdentity,
    private readonly context: SeedContextProvider,
    private readonly ledger: SeedLedgerRepository,
    private readonly runs: SeedRunRepository,
    private readonly publication: SeedPublicationService,
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Accepts a reconciliation and returns the run that will carry it out.
   *
   * The response is an acceptance, never a completion: the caller receives a
   * run identifier and watches it. Refusing to conflate the two is what keeps
   * the portal from reporting a catalogue as loaded while the load is still
   * running — or, worse, after it has failed.
   */
  async requestReconciliation(
    packageCode: string,
    expected: { version: string; checksum: string },
    actor: Actor,
  ): Promise<{ seedRunId: string; status: string; accepted: boolean }> {
    const units = SEED_UNITS[packageCode];
    if (!units) throw new NotFoundError('Seed package', packageCode);
    const manifest = await resolvePackage(packageCode);
    const { problems } = planOrder(SEED_PACKAGES);
    const schemaVersion = await this.context.appliedSchemaVersion();
    const refusal = refuseSeed(manifest, this.context.policyFor(schemaVersion), problems, expected);
    if (refusal) throw refusalToError(refusal);

    const attempt = await this.nextAttempt(manifest.code, manifest.version);
    const opened = await this.runs.openRun({
      attemptNo: attempt,
      seedRunId: randomUUID(),
      packageCode: manifest.code,
      packageVersion: manifest.version,
      operation: 'RECONCILIATION',
      actorSubject: actor.subject,
      environmentId: this.identity.environmentId,
      databaseIdentity: this.identity.databaseIdentity,
      requestFingerprint: createHash('sha256')
        .update(
          [
            this.identity.databaseIdentity,
            manifest.code,
            manifest.version,
            manifest.checksum,
            'RECONCILIATION',
            String(attempt),
          ].join('|'),
        )
        .digest('hex'),
    });
    const run = opened.run;
    // Only the request that actually inserted the row starts the work. Two that
    // arrive together both see a QUEUED run a moment later, and both starting
    // would leave one of them cancelling a run the other is already applying.
    if (!opened.created || run.status !== 'QUEUED') {
      return { seedRunId: run.seedRunId, status: run.status, accepted: false };
    }
    /*
     * What an interrupted attempt left behind, carried into this one.
     *
     * A corpus whose sixth step failed must not pay for the first five again.
     * A checkpoint that already covers every step is not a resume, though: it
     * would leave nothing pending and turn this request into a no-op that
     * still reports success, so it is discarded and the package is applied in
     * full.
     */
    const inherited = await this.runs.lastCheckpoint(
      this.identity.databaseIdentity,
      manifest.code,
      manifest.version,
    );
    const done = new Set<string>((inherited as Checkpoint | null)?.completed ?? []);
    const resumable = inherited !== null && units.some((unit) => !done.has(unit.key));
    const resumed: SeedRunRecord = resumable ? { ...run, checkpoint: inherited } : run;
    if (resumable) {
      await this.runs.updateRun(run.seedRunId, { status: 'QUEUED', checkpoint: inherited });
    }
    // Deliberately not awaited: the operator gets the run identifier now and
    // watches it, instead of holding an HTTP connection open for the minutes a
    // corpus takes. Everything the background work needs is already durable.
    void this.applyPackage(resumed, manifest.checksum).catch((error: unknown) => {
      this.logger.error({ error: toSafeErrorLog(error) }, 'Seed reconciliation crashed');
    });
    return { seedRunId: run.seedRunId, status: 'QUEUED', accepted: true };
  }

  async findRun(seedRunId: string): Promise<SeedRunRecord> {
    const run = await this.runs.findRun(seedRunId);
    if (!run) throw new NotFoundError('Seed run', seedRunId);
    return run;
  }

  /** Declares dead every run whose heartbeat stopped for longer than the lease. */
  async sweepAbandonedRuns(): Promise<number> {
    return this.runs.abandonStaleRuns(this.environment.SEED_RUN_LEASE_SECONDS);
  }

  private async nextAttempt(packageCode: string, version: string): Promise<number> {
    const rows = await this.writer.query<{ finished: string }>(
      `SELECT count(*)::text AS finished
         FROM operations.seed_run
        WHERE database_identity = :databaseIdentity
          AND package_code = :packageCode
          AND package_version = :version
          AND operation = 'RECONCILIATION'
          AND status = ANY(ARRAY[:terminal]::varchar[])`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          databaseIdentity: this.identity.databaseIdentity,
          packageCode,
          version,
          terminal: TERMINAL,
        },
      },
    );
    return Number(rows[0]?.finished ?? '0') + 1;
  }

  /**
   * Applies the package step by step, each step committing with its checkpoint.
   *
   * The lock is per package and held on one pinned connection for the whole
   * application, because the steps are separate transactions. A run that cannot
   * take the lock is cancelled with the reason rather than failed: another
   * process doing the work is not an error anybody should retry.
   */
  private async applyPackage(run: SeedRunRecord, checksum: string): Promise<void> {
    const units = SEED_UNITS[run.packageCode] ?? [];
    const outcome = await withSeedLock(this.writer, run.packageCode, async () => {
      await this.runs.updateRun(run.seedRunId, { status: 'RUNNING' });
      const completed = new Set<string>((run.checkpoint as Checkpoint | null)?.completed ?? []);
      const pending = units.filter((unit) => !completed.has(unit.key));
      try {
        for (const [index, unit] of pending.entries()) {
          await this.applyUnit(run, unit, completed, checksum, index === pending.length - 1);
        }
      } catch (error) {
        await this.runs.updateRun(run.seedRunId, {
          status: 'FAILED',
          completed: true,
          checkpoint: { completed: [...completed] },
          errorSummary:
            error instanceof Error ? error.message.slice(0, 500) : 'fallo no clasificado',
        });
        return null;
      }
      return [...completed];
    });

    if (!outcome.acquired) {
      await this.runs.updateRun(run.seedRunId, {
        status: 'CANCELLED',
        completed: true,
        errorSummary: 'Otra ejecución tiene el candado de este paquete',
      });
      return;
    }
    if (outcome.result === null) return;
    await this.publication.publishAfterSeed(run, outcome.result);
  }

  /**
   * One step: the rows, the checkpoint and — on the last step — the ledger.
   *
   * All three commit together or none of them do. A checkpoint written outside
   * the transaction would let a resumed run skip a step that rolled back, and a
   * ledger entry written outside it would let the database claim a catalogue it
   * does not hold.
   *
   * The set of completed steps is only widened **after** the transaction
   * resolves. Widening it before the commit meant that a failure at the last
   * moment left the run reporting a step that never landed — the checkpoint
   * would have been correct in the database, because it rolled back with
   * everything else, and wrong in the error path that wrote it again from
   * memory. A resumed run would then have skipped that step for good.
   */
  private async applyUnit(
    run: SeedRunRecord,
    unit: SeedUnit,
    completed: Set<string>,
    checksum: string,
    isLast: boolean,
  ): Promise<void> {
    const afterThisStep = [...completed, unit.key];
    await this.writer.transaction(async (transaction) => {
      await unit.apply(transaction);
      if (this.environment.SEED_FAULT_INJECTION === 'before-commit') {
        throw new Error('Fallo inyectado antes del commit');
      }
      await this.runs.updateRun(
        run.seedRunId,
        { status: 'RUNNING', checkpoint: { completed: afterThisStep } },
        transaction,
      );
      if (isLast) {
        await this.ledger.recordApplication(
          this.identity.databaseIdentity,
          this.identity.environmentId,
          {
            packageCode: run.packageCode,
            packageVersion: run.packageVersion,
            checksum,
            appliedAt: new Date(),
            appliedCommit: this.identity.buildCommit,
            summary: { units: afterThisStep },
          },
          transaction,
        );
      }
    });
    completed.add(unit.key);
    if (this.environment.SEED_FAULT_INJECTION === 'after-commit') {
      throw new Error('Fallo inyectado después del commit');
    }
  }
}
