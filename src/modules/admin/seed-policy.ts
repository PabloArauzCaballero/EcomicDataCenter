import { PROFILE_KINDS } from '../../database/seeds/manifest';
import type { SeedPackageManifest } from '../../database/seeds/schemas/seed-manifest.schema';
import type { DependencyProblem } from '../../database/seeds/manifest-resolution';

export type SeedRefusal =
  | { code: 'DEMO_FORBIDDEN'; message: string }
  | { code: 'PROFILE_EXCLUDED'; message: string }
  | { code: 'SCHEMA_TOO_OLD'; message: string }
  | { code: 'DEPENDENCY_INVALID'; message: string; details: readonly DependencyProblem[] }
  | { code: 'VERSION_CONFLICT'; message: string }
  | { code: 'CHECKSUM_CONFLICT'; message: string };

export interface PolicyContext {
  readonly isProduction: boolean;
  readonly demoSeedsEnabled: boolean;
  readonly seedProfile: keyof typeof PROFILE_KINDS;
  /** The highest migration this database has applied, as its four-digit prefix. */
  readonly appliedSchemaVersion: string;
}

export interface ExpectedIdentity {
  readonly version: string;
  readonly checksum: string;
}

/**
 * Everything that must be true before a single row is written, checked in order.
 *
 * The order is not cosmetic. Demo data is refused first, because in production
 * that refusal must not depend on any other check passing. Then the profile,
 * then the schema, then the dependency graph — every one of them a reason to
 * stop before the transaction opens, because a reconciliation that discovers
 * its problem halfway leaves a database in a state nobody designed.
 *
 * The version and checksum an operator states are checked last and separately.
 * They are not a policy about the package; they are a claim about what the
 * operator looked at, and refusing them is what makes «apply the difference I
 * just reviewed» mean that and not «apply whatever is there now».
 */
export function refuseSeed(
  manifest: SeedPackageManifest,
  context: PolicyContext,
  problems: readonly DependencyProblem[],
  expected?: ExpectedIdentity,
): SeedRefusal | null {
  if (manifest.kind === 'DEMO_DATA') {
    if (context.isProduction) {
      return {
        code: 'DEMO_FORBIDDEN',
        message: 'Los datos de demostración están prohibidos en producción',
      };
    }
    if (!context.demoSeedsEnabled) {
      return {
        code: 'DEMO_FORBIDDEN',
        message: 'Los datos de demostración requieren activación explícita (SEED_DEMO_ENABLED)',
      };
    }
  } else if (!PROFILE_KINDS[context.seedProfile].some((kind) => kind === manifest.kind)) {
    return {
      code: 'PROFILE_EXCLUDED',
      message: `El perfil «${context.seedProfile}» de este despliegue no incluye paquetes ${manifest.kind}`,
    };
  }

  if (manifest.minimumSchemaVersion > context.appliedSchemaVersion) {
    return {
      code: 'SCHEMA_TOO_OLD',
      message:
        `El paquete exige el esquema ${manifest.minimumSchemaVersion} y la base está en ` +
        `${context.appliedSchemaVersion}`,
    };
  }

  const relevant = problems.filter(
    (problem) => problem.code === manifest.code || problem.problem === 'cycle',
  );
  if (relevant.length) {
    return {
      code: 'DEPENDENCY_INVALID',
      message: 'El grafo de dependencias del paquete no es aplicable',
      details: relevant,
    };
  }

  if (expected && expected.version !== manifest.version) {
    return {
      code: 'VERSION_CONFLICT',
      message: `Se esperaba la versión ${expected.version} y este build lleva ${manifest.version}`,
    };
  }
  if (expected && expected.checksum !== manifest.checksum) {
    return {
      code: 'CHECKSUM_CONFLICT',
      message:
        'El contenido del paquete cambió desde que se revisó la diferencia; vuelva a validarlo',
    };
  }
  return null;
}

export type LedgerState = 'absent' | 'applied' | 'outdated' | 'conflict';

/**
 * What the ledger says about a package this build carries.
 *
 * `conflict` is the state that matters: the same code and the same version
 * recorded against a different checksum. That is never an update — it means two
 * different contents were released under one version number, and absorbing it
 * silently would destroy the only evidence of which one is in the database.
 */
export function compareLedger(
  manifest: SeedPackageManifest,
  entries: ReadonlyArray<{ packageVersion: string; checksum: string }>,
): LedgerState {
  const sameVersion = entries.find((entry) => entry.packageVersion === manifest.version);
  if (sameVersion) return sameVersion.checksum === manifest.checksum ? 'applied' : 'conflict';
  return entries.length ? 'outdated' : 'absent';
}
