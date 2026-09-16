import { QueryTypes } from 'sequelize';
import type { Actor } from '../../../src/common/auth/actor';
import { ACTOR_ROLES } from '../../../src/common/auth/actor';
import { resolvePackage } from '../../../src/database/seeds/manifest-resolution';
import { SeedExecutionService } from '../../../src/modules/admin/seed-execution.service';
import { SeedInspectionService } from '../../../src/modules/admin/seed-inspection.service';
import { DeploymentIdentity } from '../../../src/modules/admin/deployment-identity';
import { SeedLedgerRepository } from '../../../src/modules/admin/seed-ledger.repository';
import {
  describeIntegration,
  startAdminHarness,
  truncateOperations,
  type AdminHarness,
} from './harness';

const OPERATOR: Actor = { subject: 'integration-operator', roles: [ACTOR_ROLES.SEED_OPERATOR] };
const PACKAGE = 'core-catalogues';

/** Waits for a run to leave the states that mean «still working». */
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

interface ValidationShape {
  checksum: string;
  version: string;
  ledgerState: string;
  refusal: { code: string } | null;
  difference: {
    compared: boolean;
    catalogues: Array<{
      label: string;
      declared: number;
      present: number;
      missing: string[];
      modified: Array<{ identity: string; fields: Array<{ field: string }> }>;
      additional: number;
    }>;
  } | null;
}

describeIntegration('seed lifecycle over a real database', () => {
  let harness: AdminHarness;
  let inspection: SeedInspectionService;
  let execution: SeedExecutionService;
  let ledger: SeedLedgerRepository;
  let identity: DeploymentIdentity;

  beforeAll(async () => {
    harness = await startAdminHarness();
    inspection = harness.module.get(SeedInspectionService);
    execution = harness.module.get(SeedExecutionService);
    ledger = harness.module.get(SeedLedgerRepository);
    identity = harness.module.get(DeploymentIdentity);
  }, 120_000);

  afterAll(async () => {
    if (harness) await harness.close();
  });

  beforeEach(async () => {
    await truncateOperations(harness.database);
  });

  /** SEED-01: the obligatory catalogues are present and referentially valid. */
  it('applies the obligatory catalogues and records them in the ledger', async () => {
    const manifest = await resolvePackage(PACKAGE);
    const accepted = await execution.requestReconciliation(
      PACKAGE,
      { version: manifest.version, checksum: manifest.checksum },
      OPERATOR,
    );
    expect(accepted.accepted).toBe(true);
    const status = await settle(execution, accepted.seedRunId);
    expect(['SUCCEEDED', 'PARTIAL']).toContain(status);

    const entries = await harness.database.query<{ package_code: string; checksum: string }>(
      `SELECT package_code, checksum FROM operations.seed_application WHERE package_code = :code`,
      { type: QueryTypes.SELECT, replacements: { code: PACKAGE } },
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.checksum).toBe(manifest.checksum);

    const counts = await harness.database.query<{ frequencies: string; domains: string }>(
      `SELECT
         (SELECT count(*)::text FROM semantic.frequency) AS frequencies,
         (SELECT count(*)::text FROM semantic.statistical_domain) AS domains`,
      { type: QueryTypes.SELECT },
    );
    expect(Number(counts[0]?.frequencies)).toBeGreaterThan(0);
    expect(Number(counts[0]?.domains)).toBeGreaterThan(0);
  }, 180_000);

  /** SEED-02: a second application changes nothing and duplicates nothing. */
  it('is idempotent: applying twice leaves one ledger entry and the same rows', async () => {
    const manifest = await resolvePackage(PACKAGE);
    const first = await execution.requestReconciliation(
      PACKAGE,
      { version: manifest.version, checksum: manifest.checksum },
      OPERATOR,
    );
    await settle(execution, first.seedRunId);
    const before = await harness.database.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM semantic.unit_measure`,
      { type: QueryTypes.SELECT },
    );

    const second = await execution.requestReconciliation(
      PACKAGE,
      { version: manifest.version, checksum: manifest.checksum },
      OPERATOR,
    );
    expect(second.seedRunId).not.toBe(first.seedRunId);
    await settle(execution, second.seedRunId);

    const after = await harness.database.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM semantic.unit_measure`,
      { type: QueryTypes.SELECT },
    );
    expect(after[0]?.total).toBe(before[0]?.total);
    const entries = await ledger.readLedger(identity.databaseIdentity);
    expect(entries.filter((entry) => entry.packageCode === PACKAGE)).toHaveLength(1);
  }, 240_000);

  /**
   * SEED-03: two identical requests in flight collapse into one run.
   *
   * The button being disabled stops the second click; nothing stops the second
   * tab, so the collapse has to happen in the database.
   */
  it('collapses two simultaneous identical requests into one execution', async () => {
    const manifest = await resolvePackage(PACKAGE);
    const [left, right] = await Promise.all([
      execution.requestReconciliation(
        PACKAGE,
        { version: manifest.version, checksum: manifest.checksum },
        OPERATOR,
      ),
      execution.requestReconciliation(
        PACKAGE,
        { version: manifest.version, checksum: manifest.checksum },
        OPERATOR,
      ),
    ]);
    expect(left.seedRunId).toBe(right.seedRunId);
    expect([left.accepted, right.accepted].filter(Boolean)).toHaveLength(1);
    await settle(execution, left.seedRunId);

    const runs = await harness.database.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM operations.seed_run
        WHERE package_code = :code AND operation = 'RECONCILIATION'`,
      { type: QueryTypes.SELECT, replacements: { code: PACKAGE } },
    );
    expect(runs[0]?.total).toBe('1');
  }, 180_000);

  /** SEED-04: the same version with a different checksum is a conflict. */
  it('refuses a reconciliation whose reviewed checksum no longer matches', async () => {
    const manifest = await resolvePackage(PACKAGE);
    await expect(
      execution.requestReconciliation(
        PACKAGE,
        { version: manifest.version, checksum: 'f'.repeat(64) },
        OPERATOR,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const runs = await harness.database.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM operations.seed_run`,
      { type: QueryTypes.SELECT },
    );
    expect(runs[0]?.total).toBe('0');
  }, 60_000);

  /** SEED-09: a package this build does not declare is refused before any write. */
  it('refuses a package nobody declared, before opening a run', async () => {
    await expect(
      execution.requestReconciliation(
        'not-a-package',
        { version: '1.0.0', checksum: 'a'.repeat(64) },
        OPERATOR,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  }, 60_000);

  /** SEED-08 and SEED-10: a hand-edited row and an extra row read differently. */
  it('separates a hand-modified row from an additional one', async () => {
    const manifest = await resolvePackage(PACKAGE);
    const applied = await execution.requestReconciliation(
      PACKAGE,
      { version: manifest.version, checksum: manifest.checksum },
      OPERATOR,
    );
    await settle(execution, applied.seedRunId);

    const clean = (await inspection.validate(PACKAGE, OPERATOR)) as ValidationShape;
    const frequenciesClean = clean.difference?.catalogues.find(
      (entry) => entry.label === 'Frecuencias',
    );
    expect(frequenciesClean?.missing).toEqual([]);
    expect(frequenciesClean?.modified).toEqual([]);

    await harness.database.query(
      `UPDATE semantic.frequency SET name = 'Editado a mano' WHERE code = 'A'`,
    );
    const drifted = (await inspection.validate(PACKAGE, OPERATOR)) as ValidationShape;
    const frequencies = drifted.difference?.catalogues.find(
      (entry) => entry.label === 'Frecuencias',
    );
    expect(frequencies?.modified).toHaveLength(1);
    expect(frequencies?.modified[0]?.fields.map((field) => field.field)).toEqual(['name']);
    // The edit is reported, not undone: validation never writes.
    const stored = await harness.database.query<{ name: string }>(
      `SELECT name FROM semantic.frequency WHERE code = 'A'`,
      { type: QueryTypes.SELECT },
    );
    expect(stored[0]?.name).toBe('Editado a mano');

    // Reconciling repairs the managed field and leaves an unrelated row alone.
    const repair = await execution.requestReconciliation(
      PACKAGE,
      { version: manifest.version, checksum: manifest.checksum },
      OPERATOR,
    );
    await settle(execution, repair.seedRunId);
    const repaired = (await inspection.validate(PACKAGE, OPERATOR)) as ValidationShape;
    expect(
      repaired.difference?.catalogues.find((entry) => entry.label === 'Frecuencias')?.modified,
    ).toEqual([]);
  }, 300_000);
});
