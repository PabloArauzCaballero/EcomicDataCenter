import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SEED_PACKAGES, findDeclaration } from './manifest';
import {
  seedPackageDeclarationSchema,
  type SeedPackageDeclaration,
  type SeedPackageManifest,
} from './schemas/seed-manifest.schema';

const SEEDS_ROOT = resolve(__dirname);

/**
 * Expands a manifest entry into the exact files the checksum covers.
 *
 * A directory entry is expanded to its `.json` children in byte order, never in
 * the order the filesystem happens to return them: two machines must agree on
 * the checksum, and `readdir` order is not a promise.
 */
async function resolveFiles(entry: string): Promise<string[]> {
  if (entry.endsWith('.json')) return [entry];
  const names = await readdir(resolve(SEEDS_ROOT, entry));
  return names
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => `${entry}${name}`);
}

/**
 * The digest a package is identified by, and what it is computed over.
 *
 * Input: the package code, its declared version, and then, for every file in
 * sorted path order, the path, the byte length and the SHA-256 of the file's
 * bytes, each on its own line. Bytes rather than re-serialised JSON: the corpus
 * is 155 MB, and parsing and canonicalising all of it would turn every
 * validation into a minutes-long job. The repository stores and checks out LF
 * for every text file (`.gitattributes`), so the bytes are the same on every
 * machine, and Prettier already refuses formatting drift — which is what
 * canonicalisation would otherwise have to defend against.
 *
 * Including the declared version means bumping the version changes the digest
 * even when nothing else did, so a re-release is always distinguishable from
 * the release it replaces.
 */
export async function computeChecksum(
  declaration: SeedPackageDeclaration,
  files: readonly string[],
): Promise<string> {
  const digest = createHash('sha256');
  digest.update(`${declaration.code}\n${declaration.version}\n`);
  for (const file of files) {
    const bytes = await readFile(resolve(SEEDS_ROOT, file));
    const fileDigest = createHash('sha256').update(bytes).digest('hex');
    digest.update(`${file}\n${bytes.byteLength}\n${fileDigest}\n`);
  }
  return digest.digest('hex');
}

/**
 * Resolved manifests, held for the life of the process.
 *
 * The digest covers 155 MB of files that ship inside the build and cannot
 * change while it runs, so recomputing it is answering the same question again
 * at the same cost. Measured on the administrative console, that cost was 3,5 s
 * of the 3,8 s a seeds page took, and the overview inherited it because it
 * lists packages too.
 *
 * The promise is cached rather than its value, so twenty readers arriving at
 * once share one traversal instead of starting twenty. A new build is a new
 * process and therefore a new cache; nothing here has to be invalidated by hand.
 */
const resolved = new Map<string, Promise<SeedPackageManifest>>();

/** Resolves one declaration into the manifest the ledger is compared against. */
export async function resolvePackage(code: string): Promise<SeedPackageManifest> {
  const cached = resolved.get(code);
  if (cached) return cached;
  const pending = readPackage(code);
  resolved.set(code, pending);
  // A failed resolution is not cached: a missing file is a condition somebody
  // fixes, and a process that remembers the failure forever would need a
  // restart to notice that they did.
  pending.catch(() => resolved.delete(code));
  return pending;
}

async function readPackage(code: string): Promise<SeedPackageManifest> {
  const declaration = findDeclaration(code);
  if (!declaration) throw new Error(`Paquete de siembra desconocido: ${code}`);
  const parsed = seedPackageDeclarationSchema.parse(declaration);
  const files = (await Promise.all(parsed.files.map(resolveFiles))).flat().sort();
  for (const file of files) {
    const entry = await stat(resolve(SEEDS_ROOT, file));
    if (!entry.isFile()) throw new Error(`La ruta declarada no es un archivo: ${file}`);
  }
  return { ...parsed, files, checksum: await computeChecksum(parsed, files) };
}

/** Drops the cache so a test can observe a resolution it has just changed. */
export function forgetResolvedPackagesForTests(): void {
  resolved.clear();
}

export async function resolveAllPackages(): Promise<SeedPackageManifest[]> {
  return Promise.all(SEED_PACKAGES.map((declaration) => resolvePackage(declaration.code)));
}

export interface DependencyProblem {
  readonly code: string;
  readonly problem: 'missing' | 'version-mismatch' | 'cycle';
  readonly detail: string;
}

/**
 * Orders packages so that no package runs before something it depends on.
 *
 * Every problem it can find — a dependency that does not exist, one pinned to a
 * version this build does not carry, a cycle — is found before a single row is
 * written. That ordering matters more than it looks: a cycle detected halfway
 * through a reconciliation leaves a database in a state nobody designed.
 */
export function planOrder(packages: readonly SeedPackageDeclaration[]): {
  order: string[];
  problems: DependencyProblem[];
} {
  const byCode = new Map(packages.map((entry) => [entry.code, entry]));
  const problems: DependencyProblem[] = [];
  for (const entry of packages) {
    for (const dependency of entry.dependsOn) {
      const target = byCode.get(dependency.code);
      if (!target) {
        problems.push({
          code: entry.code,
          problem: 'missing',
          detail: `depende de ${dependency.code}, que no está declarado`,
        });
        continue;
      }
      if (target.version !== dependency.version) {
        problems.push({
          code: entry.code,
          problem: 'version-mismatch',
          detail: `espera ${dependency.code}@${dependency.version} y hay ${target.version}`,
        });
      }
    }
  }

  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (code: string, trail: readonly string[]): void => {
    const current = state.get(code);
    if (current === 'done') return;
    if (current === 'visiting') {
      problems.push({
        code,
        problem: 'cycle',
        detail: `ciclo de dependencias: ${[...trail, code].join(' -> ')}`,
      });
      return;
    }
    state.set(code, 'visiting');
    for (const dependency of byCode.get(code)?.dependsOn ?? []) {
      if (byCode.has(dependency.code)) visit(dependency.code, [...trail, code]);
    }
    state.set(code, 'done');
    order.push(code);
  };
  for (const entry of packages) visit(entry.code, []);
  return { order, problems };
}
