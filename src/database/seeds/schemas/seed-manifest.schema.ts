import { z } from 'zod';

export const SEED_PACKAGE_KINDS = [
  'REQUIRED_METADATA',
  'OBSERVATORY_BASELINE',
  'HISTORICAL_DATA',
  'DEMO_DATA',
] as const;

export const SEED_OWNERSHIP = ['seed_owned', 'create_only', 'versioned'] as const;

const packageCode = z.string().regex(/^[a-z][a-z0-9-]{1,79}$/u);
const semanticVersion = z.string().regex(/^\d+\.\d+\.\d+$/u);

/**
 * A seed file path, relative to `src/database/seeds`, that cannot escape it.
 *
 * The portal never chooses a path: it names a package and the manifest resolves
 * the files. This check exists anyway, because a manifest is source code that
 * somebody edits, and a `..` slipped into a path would turn a catalogue loader
 * into an arbitrary file reader.
 */
const seedPath = z
  .string()
  .regex(/^(?:boot|mock)\/[A-Za-z0-9][A-Za-z0-9._/-]{0,120}(?:\.json|\/)$/u)
  .refine((value) => !value.includes('..'), 'A seed path may not traverse upwards');

export const seedDependencySchema = z
  .object({ code: packageCode, version: semanticVersion })
  .strict();

export const seedPackageDeclarationSchema = z
  .object({
    code: packageCode,
    version: semanticVersion,
    kind: z.enum(SEED_PACKAGE_KINDS),
    /** Files whose canonical contents the checksum is computed over. */
    files: z.array(seedPath).min(1),
    dependsOn: z.array(seedDependencySchema).default([]),
    /** The lowest migration this package's rows can be written against. */
    minimumSchemaVersion: z.string().regex(/^\d{4}$/u),
    ownership: z.enum(SEED_OWNERSHIP),
    /** The capabilities that stop working when this package is missing. */
    requiredFor: z.array(z.string().min(1).max(80)).default([]),
    /** Spanish label shown in the portal; the code is what the API takes. */
    label: z.string().min(2).max(120),
  })
  .strict();

export type SeedPackageDeclaration = z.infer<typeof seedPackageDeclarationSchema>;

/** A declaration plus the checksum computed from the files it names. */
export interface SeedPackageManifest extends SeedPackageDeclaration {
  readonly checksum: string;
}

export type SeedPackageKind = (typeof SEED_PACKAGE_KINDS)[number];
export type SeedOwnership = (typeof SEED_OWNERSHIP)[number];
