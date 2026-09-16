import { QueryTypes } from 'sequelize';
import { ACTOR_ROLES, type Actor } from '../../../src/common/auth/actor';
import { resolvePackage } from '../../../src/database/seeds/manifest-resolution';
import { SeedExecutionService } from '../../../src/modules/admin/seed-execution.service';
import { SeedInspectionService } from '../../../src/modules/admin/seed-inspection.service';
import { describeIntegration, startAdminHarness, truncateOperations, type AdminHarness } from './harness';

const OPERATOR: Actor = { subject: 'integration-operator', roles: [ACTOR_ROLES.SEED_OPERATOR] };
const PACKAGE = 'core-catalogues';

async function settle(execution: SeedExecutionService, seedRunId: string): Promise<string> {
  const deadline = Date.now() + 60_000;
  let status = 'QUEUED';
  while (Date.now() < deadline) {
    const run = await execution.findRun(seedRunId);
    status = run.status;
    if (!['QUEUED', 'RUNNING'].includes(status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`La ejecución ${seedRunId} no terminó: último estado ${status}`);
}

interface Checkpoint {
  completed?: string[];
}

/**
 * The half of this system that cannot be verified by reading it.
 *
 * Whether a crash before the commit leaves nothing behind, whether one after
 * the commit leaves the data applied and its publication pending, and whether a
 * retry continues where the last attempt stopped are claims that need the crash
 * to actually happen. The injection point is refused outright in production, so
 * the mechanism cannot exist where it would matter.
 */
describeIntegration('seed recovery under injected failure', () => {
  let harness: AdminHarness | undefined;

  afterEach(async () => {
    if (harness) await harness.close();
    harness = undefined;
  });

  /** SEED-05: a failure before the commit leaves the unit entirely unapplied. */
  it('rolls the transactional unit back and reports the failure', async () => {
    harness = await startAdminHarness({ SEED_FAULT_INJECTION: 'before-commit' });
    const execution = harness.module.get(SeedExecutionService);
    await truncateOperations(harness.database);
    await harness.database.query(`DELETE FROM semantic.frequency WHERE code = 'ZZTEST'`);

    const manifest = await resolvePackage(PACKAGE);
    const accepted = await execution.requestReconciliation(
      PACKAGE,
      { version: manifest.version, checksum: manifest.checksum },
      OPERATOR,
    );
    expect(await settle(execution, accepted.seedRunId)).toBe('FAILED');

    const run = await execution.findRun(accepted.seedRunId);
    expect(run.errorSummary).toContain('antes del commit');
    // Nothing reached the ledger: the run failed before any unit committed.
    const entries = await harness.database.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM operations.seed_application`,
      { type: QueryTypes.SELECT },
    );
    expect(entries[0]?.total).toBe('0');
    // And no checkpoint claims a unit that never landed.
    expect((run.checkpoint as Checkpoint | null)?.completed ?? []).toEqual([]);
  }, 180_000);

  /**
   * SEED-06 and SEED-11: a failure after a commit keeps what landed, says so,
   * and the next attempt continues from there instead of starting over.
   */
  it('keeps committed units, reports the failure and resumes from the checkpoint', async () => {
    harness = await startAdminHarness({ SEED_FAULT_INJECTION: 'after-commit' });
    const execution = harness.module.get(SeedExecutionService);
    await truncateOperations(harness.database);

    const manifest = await resolvePackage(PACKAGE);
    const first = await execution.requestReconciliation(
      PACKAGE,
      { version: manifest.version, checksum: manifest.checksum },
      OPERATOR,
    );
    expect(await settle(execution, first.seedRunId)).toBe('FAILED');
    const failed = await execution.findRun(first.seedRunId);
    const landed = (failed.checkpoint as Checkpoint | null)?.completed ?? [];
    expect(landed).toHaveLength(1);
    expect(failed.errorSummary).toContain('después del commit');

    // The unit that committed is in the database, not rolled back with the run.
    const frequencies = await harness.database.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM semantic.frequency`,
      { type: QueryTypes.SELECT },
    );
    expect(Number(frequencies[0]?.total)).toBeGreaterThan(0);

    await harness.close();
    harness = await startAdminHarness();
    const clean = harness.module.get(SeedExecutionService);
    const second = await clean.requestReconciliation(
      PACKAGE,
      { version: manifest.version, checksum: manifest.checksum },
      OPERATOR,
    );
    expect(second.accepted).toBe(true);
    expect(await settle(clean, second.seedRunId)).toBe('SUCCEEDED');
    const resumed = await clean.findRun(second.seedRunId);
    const completed = (resumed.checkpoint as Checkpoint | null)?.completed ?? [];
    // It carried the earlier progress forward and finished the rest.
    expect(completed).toEqual(expect.arrayContaining(landed));
    expect(completed.length).toBeGreaterThan(landed.length);
  }, 300_000);

  /** SEED-06: applied data with a failed publication is PARTIAL, never success. */
  it('separates «applied» from «published» when the rebuild never happens', async () => {
    harness = await startAdminHarness({ SEED_FAULT_INJECTION: 'before-publish' });
    const execution = harness.module.get(SeedExecutionService);
    await truncateOperations(harness.database);

    const manifest = await resolvePackage(PACKAGE);
    const accepted = await execution.requestReconciliation(
      PACKAGE,
      { version: manifest.version, checksum: manifest.checksum },
      OPERATOR,
    );
    expect(await settle(execution, accepted.seedRunId)).toBe('PARTIAL');
    const run = await execution.findRun(accepted.seedRunId);
    expect(run.errorSummary).toContain('publicación quedó pendiente');

    // The rows are there and the ledger records them; only the visibility is not.
    const entries = await harness.database.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM operations.seed_application WHERE package_code = :code`,
      { type: QueryTypes.SELECT, replacements: { code: PACKAGE } },
    );
    expect(entries[0]?.total).toBe('1');
    const publication = await harness.database.query<{ status: string }>(
      `SELECT status FROM operations.read_model_publication WHERE dataset_code = :code`,
      { type: QueryTypes.SELECT, replacements: { code: `seed:${PACKAGE}` } },
    );
    expect(publication[0]?.status).toBe('PENDING');
  }, 180_000);

  /** SEED-07: demo data is refused in a production environment before any write. */
  it('refuses demo data in a production environment before writing anything', async () => {
    harness = await startAdminHarness({
      NODE_ENV: 'production',
      AUTH_MODE: 'agent_key',
      AGENT_INGESTION_KEY: 'k'.repeat(48),
      SWAGGER_ENABLED: 'false',
      METRICS_ENABLED: 'false',
      SEED_DEMO_ENABLED: 'false',
    });
    const execution = harness.module.get(SeedExecutionService);
    const inspection = harness.module.get(SeedInspectionService);
    await truncateOperations(harness.database);

    const manifest = await resolvePackage('observatory-demo');
    await expect(
      execution.requestReconciliation(
        'observatory-demo',
        { version: manifest.version, checksum: manifest.checksum },
        OPERATOR,
      ),
    ).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });

    const validation = (await inspection.validate('observatory-demo', OPERATOR)) as {
      refusal: { code: string } | null;
      difference: unknown;
    };
    expect(validation.refusal?.code).toBe('DEMO_FORBIDDEN');
    expect(validation.difference).toBeNull();

    const applied = await harness.database.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM operations.seed_application
        WHERE package_code = 'observatory-demo'`,
      { type: QueryTypes.SELECT },
    );
    expect(applied[0]?.total).toBe('0');
  }, 180_000);

  /**
   * ING-07: abandonment is decided by the heartbeat, never by duration.
   *
   * A long corpus that is still working must survive the sweep; a run whose
   * process died must not.
   */
  it('abandons a run whose heartbeat stopped and spares one that is still beating', async () => {
    harness = await startAdminHarness();
    const execution = harness.module.get(SeedExecutionService);
    await truncateOperations(harness.database);

    await harness.database.query(
      `INSERT INTO operations.seed_run (
         seed_run_id, package_code, package_version, operation, attempt_no, actor_subject,
         environment_id, database_identity, status, request_fingerprint,
         started_at, heartbeat_at, counters_json
       ) VALUES
         (gen_random_uuid(), 'core-catalogues', '1.0.0', 'RECONCILIATION', 1, 'dead',
          'integration', 'test', 'RUNNING', :deadFingerprint,
          now() - interval '3 hours', now() - interval '3 hours', '{}'::jsonb),
         (gen_random_uuid(), 'press-archive', '1.0.0', 'RECONCILIATION', 1, 'alive',
          'integration', 'test', 'RUNNING', :aliveFingerprint,
          now() - interval '3 hours', now(), '{}'::jsonb)`,
      {
        type: QueryTypes.INSERT,
        replacements: { deadFingerprint: 'a'.repeat(64), aliveFingerprint: 'b'.repeat(64) },
      },
    );

    const abandoned = await execution.sweepAbandonedRuns();
    expect(abandoned).toBe(1);

    const states = await harness.database.query<{ actor_subject: string; status: string }>(
      `SELECT actor_subject, status FROM operations.seed_run ORDER BY actor_subject`,
      { type: QueryTypes.SELECT },
    );
    expect(states).toEqual([
      { actor_subject: 'alive', status: 'RUNNING' },
      { actor_subject: 'dead', status: 'ABANDONED' },
    ]);
  }, 180_000);
});
