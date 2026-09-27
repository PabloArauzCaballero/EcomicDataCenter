import type { SeedPackageManifest } from '../../../database/seeds/schemas/seed-manifest.schema';
import { compareLedger, refuseSeed, type PolicyContext } from '../seed-policy';

const CHECKSUM = 'a'.repeat(64);

function manifest(overrides: Partial<SeedPackageManifest> = {}): SeedPackageManifest {
  return {
    code: 'core-catalogues',
    version: '1.0.0',
    kind: 'REQUIRED_METADATA',
    files: ['boot/frequencies.json'],
    dependsOn: [],
    minimumSchemaVersion: '0013',
    ownership: 'seed_owned',
    requiredFor: [],
    label: 'Catálogos base',
    checksum: CHECKSUM,
    ...overrides,
  };
}

function context(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    isProduction: false,
    demoSeedsEnabled: false,
    seedProfile: 'historical',
    appliedSchemaVersion: '0075',
    ...overrides,
  };
}

describe('refuseSeed', () => {
  it('admits a required catalogue on a current schema', () => {
    expect(refuseSeed(manifest(), context(), [])).toBeNull();
  });

  it('refuses demo data in production before anything else is considered', () => {
    const refusal = refuseSeed(
      manifest({ kind: 'DEMO_DATA', minimumSchemaVersion: '9999' }),
      context({ isProduction: true, demoSeedsEnabled: true }),
      [],
    );
    expect(refusal?.code).toBe('DEMO_FORBIDDEN');
  });

  it('refuses demo data outside production unless it was explicitly enabled', () => {
    expect(refuseSeed(manifest({ kind: 'DEMO_DATA' }), context(), [])?.code).toBe('DEMO_FORBIDDEN');
    expect(
      refuseSeed(manifest({ kind: 'DEMO_DATA' }), context({ demoSeedsEnabled: true }), []),
    ).toBeNull();
  });

  it('refuses a corpus on a deployment whose profile stops at metadata', () => {
    const refusal = refuseSeed(
      manifest({ kind: 'HISTORICAL_DATA' }),
      context({ seedProfile: 'metadata' }),
      [],
    );
    expect(refusal?.code).toBe('PROFILE_EXCLUDED');
  });

  it('refuses a package that needs a schema this database has not reached', () => {
    const refusal = refuseSeed(
      manifest({ minimumSchemaVersion: '0090' }),
      context({ appliedSchemaVersion: '0075' }),
      [],
    );
    expect(refusal?.code).toBe('SCHEMA_TOO_OLD');
  });

  it('refuses a package whose dependency graph is broken', () => {
    const refusal = refuseSeed(manifest(), context(), [
      { code: 'core-catalogues', problem: 'missing', detail: 'depende de x' },
    ]);
    expect(refusal?.code).toBe('DEPENDENCY_INVALID');
  });

  it('refuses a cycle even when it names another package', () => {
    const refusal = refuseSeed(manifest(), context(), [
      { code: 'other', problem: 'cycle', detail: 'a -> b -> a' },
    ]);
    expect(refusal?.code).toBe('DEPENDENCY_INVALID');
  });

  /**
   * The whole point of stating the checksum: «apply the difference I reviewed»
   * must not become «apply whatever is there now».
   */
  it('refuses when the reviewed checksum no longer matches the build', () => {
    const refusal = refuseSeed(manifest(), context(), [], {
      version: '1.0.0',
      checksum: 'b'.repeat(64),
    });
    expect(refusal?.code).toBe('CHECKSUM_CONFLICT');
  });

  it('refuses when the stated version is not the one this build carries', () => {
    const refusal = refuseSeed(manifest(), context(), [], {
      version: '0.9.0',
      checksum: CHECKSUM,
    });
    expect(refusal?.code).toBe('VERSION_CONFLICT');
  });
});

describe('compareLedger', () => {
  it('is absent when the ledger holds nothing for the package', () => {
    expect(compareLedger(manifest(), [])).toBe('absent');
  });

  it('is applied when version and checksum both match', () => {
    expect(compareLedger(manifest(), [{ packageVersion: '1.0.0', checksum: CHECKSUM }])).toBe(
      'applied',
    );
  });

  it('is outdated when only older versions were applied', () => {
    expect(compareLedger(manifest(), [{ packageVersion: '0.9.0', checksum: CHECKSUM }])).toBe(
      'outdated',
    );
  });

  /**
   * One version, two contents. Absorbing this silently would destroy the only
   * record of which of the two is actually in the database.
   */
  it('is a conflict when the same version was applied with another checksum', () => {
    expect(compareLedger(manifest(), [{ packageVersion: '1.0.0', checksum: 'c'.repeat(64) }])).toBe(
      'conflict',
    );
  });
});
