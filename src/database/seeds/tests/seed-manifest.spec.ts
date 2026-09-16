import { SEED_PACKAGES, PROFILE_KINDS, findDeclaration } from '../manifest';
import {
  computeChecksum,
  planOrder,
  resolvePackage,
  resolveAllPackages,
} from '../manifest-resolution';
import { seedPackageDeclarationSchema } from '../schemas/seed-manifest.schema';

describe('seed manifest', () => {
  it('declares every package with a shape the schema accepts', () => {
    for (const declaration of SEED_PACKAGES) {
      expect(() => seedPackageDeclarationSchema.parse(declaration)).not.toThrow();
    }
  });

  it('has no duplicate package codes', () => {
    const codes = SEED_PACKAGES.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('orders dependencies before the packages that need them', () => {
    const { order, problems } = planOrder(SEED_PACKAGES);
    expect(problems).toEqual([]);
    for (const entry of SEED_PACKAGES) {
      for (const dependency of entry.dependsOn) {
        expect(order.indexOf(dependency.code)).toBeLessThan(order.indexOf(entry.code));
      }
    }
  });

  it('reports a missing dependency before anything is written', () => {
    const { problems } = planOrder([
      { ...SEED_PACKAGES[0]!, code: 'a', dependsOn: [{ code: 'ghost', version: '1.0.0' }] },
    ]);
    expect(problems[0]?.problem).toBe('missing');
  });

  it('reports a version this build does not carry', () => {
    const { problems } = planOrder([
      { ...SEED_PACKAGES[0]!, code: 'a', dependsOn: [{ code: 'b', version: '9.9.9' }] },
      { ...SEED_PACKAGES[0]!, code: 'b', version: '1.0.0', dependsOn: [] },
    ]);
    expect(problems[0]?.problem).toBe('version-mismatch');
  });

  it('reports a cycle instead of ordering it', () => {
    const { problems } = planOrder([
      { ...SEED_PACKAGES[0]!, code: 'a', dependsOn: [{ code: 'b', version: '1.0.0' }] },
      {
        ...SEED_PACKAGES[0]!,
        code: 'b',
        version: '1.0.0',
        dependsOn: [{ code: 'a', version: '1.0.0' }],
      },
    ]);
    expect(problems.some((problem) => problem.problem === 'cycle')).toBe(true);
  });

  it('keeps demo data out of every profile', () => {
    for (const kinds of Object.values(PROFILE_KINDS)) {
      expect(kinds).not.toContain('DEMO_DATA');
    }
  });

  it('declares exactly one demo package and it is not required by anything', () => {
    const demo = SEED_PACKAGES.filter((entry) => entry.kind === 'DEMO_DATA');
    expect(demo).toHaveLength(1);
    expect(demo[0]?.requiredFor).toEqual([]);
  });
});

describe('checksum', () => {
  it('is stable across two resolutions of the same package', async () => {
    const first = await resolvePackage('core-catalogues');
    const second = await resolvePackage('core-catalogues');
    expect(first.checksum).toBe(second.checksum);
    expect(first.checksum).toMatch(/^[a-f0-9]{64}$/u);
  });

  /**
   * Bumping the version has to change the digest even when no file did, so a
   * re-release is always distinguishable from the release it replaces.
   */
  it('changes when the declared version changes', async () => {
    const declaration = findDeclaration('core-catalogues');
    expect(declaration).toBeDefined();
    const resolved = await resolvePackage('core-catalogues');
    const bumped = await computeChecksum({ ...declaration!, version: '1.0.1' }, resolved.files);
    expect(bumped).not.toBe(resolved.checksum);
  });

  it('expands a directory entry into the files it actually holds', async () => {
    const resolved = await resolvePackage('press-archive');
    expect(resolved.files.length).toBeGreaterThan(1);
    expect(resolved.files.every((file) => file.endsWith('.json'))).toBe(true);
  });

  it('refuses a package nobody declared', async () => {
    await expect(resolvePackage('does-not-exist')).rejects.toThrow(/desconocido/u);
  });

  it('resolves every declared package without touching the database', async () => {
    const all = await resolveAllPackages();
    expect(all).toHaveLength(SEED_PACKAGES.length);
    expect(new Set(all.map((entry) => entry.checksum)).size).toBe(all.length);
  });
});
