import { QueryTypes } from 'sequelize';
import { resolvePackage } from '../../../src/database/seeds/manifest-resolution';
import { AdminOverviewService } from '../../../src/modules/admin/admin-overview.service';
import { DeploymentIdentity } from '../../../src/modules/admin/deployment-identity';
import { SeedInspectionService } from '../../../src/modules/admin/seed-inspection.service';
import {
  describeIntegration,
  startAdminHarness,
  truncateOperations,
  type AdminHarness,
} from './harness';

/**
 * HLT-04: a reachable database is not a ready deployment.
 *
 * The summary has to separate «the database answered» from «everything this
 * database needs is in it». A mandatory catalogue that was never applied leaves
 * every screen technically working and quietly wrong, which is the failure that
 * reads as healthy, so the three states the ledger can be in are checked here
 * against the register rather than against a held belief about it.
 */
const MANDATORY = 'core-catalogues';

interface SeedShape {
  code: string;
  kind: string;
  ledgerState: string;
  requiredFor: readonly string[];
  applicable: boolean;
}

interface OverviewSeeds {
  packages: number;
  requiredMissing: number;
  conflicts: number;
}

describeIntegration('deployment readiness', () => {
  let harness: AdminHarness;
  let overview: AdminOverviewService;
  let seeds: SeedInspectionService;
  let identity: DeploymentIdentity;

  beforeAll(async () => {
    harness = await startAdminHarness();
    overview = harness.module.get(AdminOverviewService);
    seeds = harness.module.get(SeedInspectionService);
    identity = harness.module.get(DeploymentIdentity);
  }, 120_000);

  afterAll(async () => {
    if (harness) await harness.close();
  });

  beforeEach(async () => {
    await truncateOperations(harness.database);
  });

  async function seedSummary(): Promise<OverviewSeeds> {
    const described = await overview.describe();
    return described.data['seeds'] as OverviewSeeds;
  }

  async function packageEntry(): Promise<SeedShape> {
    const listed = (await seeds.listPackages()) as SeedShape[];
    const entry = listed.find((item) => item.code === MANDATORY);
    if (!entry) throw new Error(`${MANDATORY} is not in the manifest`);
    return entry;
  }

  /** Writes a ledger entry the way an application does, with a chosen checksum. */
  async function recordApplied(checksum: string): Promise<void> {
    const manifest = await resolvePackage(MANDATORY);
    await harness.database.query(
      `INSERT INTO operations.seed_application (
         seed_application_id, database_identity, environment_id, package_code,
         package_version, checksum, applied_commit, applied_at, summary_json
       ) VALUES (
         gen_random_uuid(), :databaseIdentity, :environmentId, :packageCode,
         :packageVersion, :checksum, NULL, now(), CAST(:summary AS jsonb)
       )`,
      {
        type: QueryTypes.INSERT,
        replacements: {
          databaseIdentity: identity.databaseIdentity,
          environmentId: identity.environmentId,
          packageCode: manifest.code,
          packageVersion: manifest.version,
          checksum,
          summary: JSON.stringify({ units: [] }),
        },
      },
    );
  }

  it('counts a mandatory catalogue that was never applied and names what depends on it', async () => {
    const entry = await packageEntry();
    expect(entry.kind).toBe('REQUIRED_METADATA');
    expect(entry.applicable).toBe(true);
    expect(entry.ledgerState).toBe('absent');
    // The cause is on the entry, not only in a colour: these are the capabilities
    // that are running without the catalogue they were built on.
    expect(entry.requiredFor).toEqual(
      expect.arrayContaining(['ingesta', 'gobernanza', 'calidad', 'tablero-publico']),
    );

    const summary = await seedSummary();
    expect(summary.requiredMissing).toBeGreaterThanOrEqual(1);
    expect(summary.packages).toBeGreaterThan(0);
  }, 120_000);

  it('stops counting it as missing once the ledger says it was applied', async () => {
    const manifest = await resolvePackage(MANDATORY);
    await recordApplied(manifest.checksum);

    expect((await packageEntry()).ledgerState).toBe('applied');
    const summary = await seedSummary();
    expect(summary.requiredMissing).toBe(0);
    expect(summary.conflicts).toBe(0);
  }, 120_000);

  it('treats a ledger entry that disagrees with this build as a conflict, not as applied', async () => {
    // Same version, different content: the register says this database holds a
    // catalogue that is not the one this build carries. Reporting that as
    // applied would be the register agreeing with itself and with nothing else.
    await recordApplied('0'.repeat(64));

    expect((await packageEntry()).ledgerState).toBe('conflict');
    const summary = await seedSummary();
    expect(summary.conflicts).toBeGreaterThanOrEqual(1);
    expect(summary.requiredMissing).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
