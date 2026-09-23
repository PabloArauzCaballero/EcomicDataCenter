/**
 * The part of the three official-source builders that is the same in all three.
 *
 * Reading the arguments, fingerprinting the download, gathering the places the
 * observatory already holds and writing the seed in pieces. What each source
 * keeps and drops is decided in its own reader and printed by its own builder.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexHeldPlaces, readHeldPlacesForComparison } from './read-expansion-delivery.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BOOT = join(ROOT, 'src/database/seeds/boot');
const PLACES_PER_PIECE = 1200;

export function readArguments(argv, required) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith('--')) throw new Error(`unexpected argument ${argv[index]}`);
    options.set(argv[index].slice(2), argv[index + 1]);
  }
  for (const name of required) {
    if (!options.get(name)) throw new Error(`--${name} is required`);
  }
  const retrieved = options.get('retrieved');
  if (retrieved && Number.isNaN(Date.parse(retrieved))) {
    throw new Error('--retrieved must be the ISO time the file was downloaded');
  }
  return options;
}

/**
 * The download, read once and fingerprinted.
 *
 * When the runbook names the fingerprint of the file it was built from, a
 * different file stops the build before anything is read.
 */
export async function readDownload(path, expectedSha256) {
  const bytes = await readFile(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (expectedSha256 && expectedSha256 !== sha256) {
    throw new Error(`la huella de ${path} es ${sha256}, no ${expectedSha256}`);
  }
  return { text: bytes.toString('utf8'), sha256 };
}

/** Every place seed in the repository except the one being written. */
export async function heldPlaces(out) {
  const entries = await readdir(BOOT, { withFileTypes: true });
  const held = [];
  for (const entry of entries) {
    const directory = join(BOOT, entry.name);
    if (!entry.isDirectory() || !entry.name.endsWith('-poi') || resolve(directory) === out) {
      continue;
    }
    held.push(...(await readHeldPlacesForComparison(directory, readdir, join)));
  }
  return {
    count: held.length,
    ids: new Set(held.map((place) => place.placeId)),
    grid: indexHeldPlaces(held),
  };
}

/**
 * The seed, written whole in pieces of 1.200 places.
 *
 * The output directory is emptied first. Point it at a directory of its own:
 * pointing it at another source's seed would delete that seed.
 */
export async function writeSeed(out, prefix, provenance, places) {
  await mkdir(out, { recursive: true });
  for (const stale of await readdir(out)) {
    if (stale.endsWith('.json')) await unlink(join(out, stale));
  }
  const pieces = Math.ceil(places.length / PLACES_PER_PIECE);
  for (let piece = 0; piece < pieces; piece += 1) {
    const body = {
      dataset: 'bolivia-national-poi-v3',
      provenance,
      places: places.slice(piece * PLACES_PER_PIECE, (piece + 1) * PLACES_PER_PIECE),
    };
    const name = `${prefix}-${String(piece).padStart(3, '0')}.json`;
    await writeFile(join(out, name), `${JSON.stringify(body)}\n`, 'utf8');
  }
  return pieces;
}

/** Una linea de la cuenta que imprime cada constructor. */
export function report(label, count) {
  process.stdout.write(`${label.padEnd(34)}${count}\n`);
}
