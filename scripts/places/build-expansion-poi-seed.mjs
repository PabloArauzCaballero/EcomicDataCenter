#!/usr/bin/env node
/**
 * Builds the Cochabamba and La Paz expansion seed from the delivered altas.
 *
 * Usage:
 *   node scripts/places/build-expansion-poi-seed.mjs \
 *     --altas <altas JSON as delivered> \
 *     --catalogue <family catalogue, CSV or JSON> \
 *     [--expected-sha256 <the hash the delivery declares>] \
 *     [--held <existing place seed directory>] \
 *     [--out <seed directory to write>] \
 *     [--gaps <path for the missing-family report>] \
 *     [--partial]
 *
 * Like the national builder it refuses to guess a family. Unlike it, it will
 * write what the catalogue does cover when `--partial` is passed, because in
 * this delivery every row the catalogue covers is already refined — none of
 * them carries the generic-family flag, so a later catalogue has nothing to
 * reclassify and the rows will not have to be superseded. That is a measured
 * property of this corpus, not a general licence.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFamilyCatalogue } from './read-family-catalogue.mjs';
import {
  indexHeldPlaces,
  readExpansionDelivery,
  readHeldPlacesForComparison,
} from './read-expansion-delivery.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLACES_PER_PIECE = 1200;
const SOURCE = 'https://files.catbox.moe/tgyjlv.json';

function readArguments(argv) {
  const options = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`unexpected argument ${argument}`);
    if (argument === '--partial') {
      flags.add('partial');
      continue;
    }
    options.set(argument.slice(2), argv[index + 1]);
    index += 1;
  }
  for (const required of ['altas', 'catalogue']) {
    if (!options.get(required)) throw new Error(`--${required} is required`);
  }
  return {
    altas: options.get('altas'),
    catalogue: options.get('catalogue'),
    expectedSha256: options.get('expected-sha256'),
    held: options.get('held') ?? join(ROOT, 'src/database/seeds/boot/bolivia-poi'),
    out: options.get('out') ?? join(ROOT, 'src/database/seeds/boot/bolivia-expansion-poi'),
    gaps: options.get('gaps') ?? join(ROOT, 'artifacts/expansion-poi-missing-families.json'),
    partial: flags.has('partial'),
  };
}

/**
 * The file as received, hashed, and checked against what was promised.
 *
 * The delivery publishes the hash of this exact file. Building a seed from
 * bytes that do not match it would put a corpus in the database that no report
 * describes, so the mismatch stops the build rather than warning about it.
 */
async function fingerprint(path, expected) {
  const bytes = await readFile(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (expected && sha256 !== expected) {
    throw new Error(`the file hashes ${sha256} and the delivery declares ${expected}`);
  }
  return sha256;
}

/** Everything about the delivery that is true of every place in it. */
function provenanceOf(sha256, catalogue) {
  return {
    publishers: ['OpenStreetMap contributors'],
    // OpenStreetMap publica sin version; lo que identifica esta lectura es el
    // dia del snapshot, que es lo que cada fila trae en `timestamp_osm_base`.
    release: '2026-09-12',
    extractionDate: '2026-09-12',
    deliverySha256: sha256,
    deliveryReportSha256: '902aff872ce65ec7ec10efd4a2dbe3ba9a2c08529fa7a41f59a50248612b23fb',
    deliveryUri: SOURCE,
    upstreamDatasets: ['https://www.openstreetmap.org/'],
    licences: ['ODbL-1.0'],
    geofenceMethod: 'osm_administrative_area',
    countryCode: 'BO',
    catalogueFamilies: catalogue.size,
  };
}

/** The families the catalogue does not define, as the request to define them. */
async function writeGapReport(path, missingFamilies) {
  const families = [...missingFamilies.entries()]
    .sort((left, right) => right[1].records - left[1].records)
    .map(([code, seen]) => ({
      code,
      records: seen.records,
      publisherCategories: [...seen.categories].sort(),
      group: null,
      commercial_role: null,
      is_regulated: null,
      official_validation_source: null,
    }));
  const body = {
    _leame:
      'Familias que la ampliacion de Cochabamba y La Paz usa y el catalogo no define. Cada entrada necesita group, commercial_role, is_regulated y official_validation_source en el formato del anexo C.',
    familiasSinDefinir: families.length,
    registrosAfectados: families.reduce((total, family) => total + family.records, 0),
    familias: families,
  };
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

/** Replaces the seed directory, so a rebuild never leaves a stale piece behind. */
async function writePieces(directory, provenance, places) {
  await mkdir(directory, { recursive: true });
  for (const stale of await readdir(directory)) {
    if (stale.endsWith('.json')) await unlink(join(directory, stale));
  }
  const pieces = Math.ceil(places.length / PLACES_PER_PIECE);
  for (let piece = 0; piece < pieces; piece += 1) {
    const slice = places.slice(piece * PLACES_PER_PIECE, (piece + 1) * PLACES_PER_PIECE);
    const body = { dataset: 'bolivia-national-poi-v3', provenance, places: slice };
    await writeFile(
      join(directory, `expansion-poi-${String(piece).padStart(3, '0')}.json`),
      `${JSON.stringify(body)}\n`,
      'utf8',
    );
  }
  return pieces;
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  const sha256 = await fingerprint(options.altas, options.expectedSha256);
  const catalogue = await readFamilyCatalogue(options.catalogue);
  const heldPlaces = await readHeldPlacesForComparison(options.held, readdir, join);
  const grid = indexHeldPlaces(heldPlaces);

  const delivery = await readExpansionDelivery(options.altas, catalogue, grid);
  const missing = [...delivery.missingFamilies.values()];
  const affected = missing.reduce((total, family) => total + family.records, 0);

  process.stdout.write(`huella verificada:    ${sha256}\n`);
  process.stdout.write(`altas leidas:         ${delivery.read}\n`);
  process.stdout.write(`lugares ya guardados: ${heldPlaces.length}\n`);
  process.stdout.write(`clasificados:         ${delivery.places.length}\n`);
  process.stdout.write(
    `sin familia:          ${affected} en ${delivery.missingFamilies.size} familias\n`,
  );
  process.stdout.write(`parecidos a uno ya guardado: ${delivery.resembling}\n`);

  if (delivery.missingFamilies.size > 0) {
    await writeGapReport(options.gaps, delivery.missingFamilies);
    process.stdout.write(`lo que falta esta en ${options.gaps}\n`);
    if (!options.partial) {
      process.stdout.write(
        '\nNO SE ESCRIBE LA SIEMBRA. Repite con --partial para escribir solo lo clasificado.\n',
      );
      process.exitCode = 1;
      return;
    }
  }
  if (delivery.places.length === 0) {
    process.stdout.write('\nNo hay nada clasificado que escribir.\n');
    process.exitCode = 1;
    return;
  }

  const pieces = await writePieces(options.out, provenanceOf(sha256, catalogue), delivery.places);
  process.stdout.write(`\nsiembra escrita: ${pieces} piezas en ${options.out}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
