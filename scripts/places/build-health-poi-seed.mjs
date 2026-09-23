#!/usr/bin/env node
/**
 * Builds the health-sector seed from an OpenStreetMap extract.
 *
 * Usage:
 *   node scripts/places/build-health-poi-seed.mjs \
 *     --extract   <health-osm-extract.json> \
 *     --catalogue scripts/places/catalogue/bolivia-place-families.json \
 *     --out       src/database/seeds/boot/bolivia-health-poi \
 *     [--date 2026-09-23]
 *
 * The extract is produced by `scripts/places/extract-health-osm.py` (see that
 * file's header for why a downloaded Geofabrik file stands in for the
 * Overpass query the task asked for). What this script does with it is what
 * `build-establishments-poi-seed.mjs` does with its delivery: compare against
 * every place seed already in the repository, by identifier so nothing that
 * is already loaded lands twice, and by name and distance so a facility the
 * corpus already holds under a different identifier is flagged instead of
 * duplicated. `read-health-osm.mjs` does the one thing no reader before it
 * had to: decide which family a row belongs to, because nobody shipped this
 * one pre-classified.
 *
 * The output directory is replaced whole. Point it at a directory of its own:
 * pointing it at another delivery's seed would delete that seed.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexHeldPlaces, readHeldPlacesForComparison } from './read-expansion-delivery.mjs';
import { readHealthOsmDelivery } from './read-health-osm.mjs';
import { readFamilyCatalogue } from './read-family-catalogue.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOT = join(ROOT, 'src/database/seeds/boot');
const PLACES_PER_PIECE = 1200;

function readArguments(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith('--')) throw new Error(`unexpected argument ${argv[index]}`);
    options.set(argv[index].slice(2), argv[index + 1]);
  }
  for (const required of ['extract', 'catalogue', 'out']) {
    if (!options.get(required)) throw new Error(`--${required} is required`);
  }
  return {
    extract: options.get('extract'),
    catalogue: options.get('catalogue'),
    out: resolve(options.get('out')),
    date: options.get('date') ?? '2026-09-23',
  };
}

/** Every place seed directory in the repository except the one being written. */
async function heldSeedDirectories(out) {
  const entries = await readdir(BOOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('-poi'))
    .map((entry) => join(BOOT, entry.name))
    .filter((directory) => resolve(directory) !== out);
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  const extractBytes = await readFile(options.extract);
  const extractSha256 = createHash('sha256').update(extractBytes).digest('hex');
  const extract = JSON.parse(extractBytes.toString('utf8'));

  const catalogueBytes = await readFile(options.catalogue);
  const catalogueDocument = JSON.parse(catalogueBytes.toString('utf8'));
  const catalogue = await readFamilyCatalogue(options.catalogue);

  const held = [];
  for (const directory of await heldSeedDirectories(options.out)) {
    held.push(...(await readHeldPlacesForComparison(directory, readdir, join)));
  }
  const heldIds = new Set(held.map((place) => place.placeId));

  const delivery = await readHealthOsmDelivery(
    extract,
    catalogueDocument,
    catalogue,
    heldIds,
    indexHeldPlaces(held),
  );

  const { rejected } = delivery;
  process.stdout.write(`huella del extracto:       ${extractSha256}\n`);
  process.stdout.write(`registros leidos:          ${delivery.read}\n`);
  process.stdout.write(`lugares ya guardados:       ${held.length}\n`);
  process.stdout.write(`  ya estaban en la base:    ${rejected.alreadyHeld}\n`);
  process.stdout.write(`  coordenada imposible:     ${rejected.offPlanet}\n`);
  process.stdout.write(`  fuera de Bolivia:         ${rejected.outsideCountry}\n`);
  process.stdout.write(`  nombre de persona sola:   ${rejected.personName}\n`);
  process.stdout.write(
    `  sin clasificar (etiqueta):${String(rejected.unclassified).padStart(6)}\n`,
  );
  process.stdout.write(`se escriben:                ${delivery.places.length}\n`);
  process.stdout.write(`  parecidos a uno guardado: ${delivery.resembling}\n`);

  if (delivery.missingFamilies.size > 0) {
    const missing = [...delivery.missingFamilies]
      .map(([code, seen]) => ({ code, records: seen.records, categories: [...seen.categories] }))
      .sort((one, other) => other.records - one.records);
    const report = join(ROOT, 'artifacts/health-poi-missing-families.json');
    await mkdir(dirname(report), { recursive: true });
    await writeFile(report, `${JSON.stringify(missing, null, 2)}\n`, 'utf8');
    process.stderr.write(
      `\nel catalogo no define ${missing.length} familias. Estan en ${report}. No se escribe nada.\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (delivery.places.length === 0) {
    process.stdout.write('\nNo hay nada que escribir.\n');
    process.exitCode = 1;
    return;
  }

  const byFamily = new Map();
  for (const place of delivery.places) {
    byFamily.set(place.entityFamily, (byFamily.get(place.entityFamily) ?? 0) + 1);
  }
  process.stdout.write('\npor familia:\n');
  for (const [family, count] of [...byFamily].sort((one, other) => other[1] - one[1])) {
    process.stdout.write(`  ${family.padEnd(28)} ${count}\n`);
  }

  const provenance = {
    publishers: ['OpenStreetMap contributors'],
    release: extract.extraction?.snapshotDate ?? options.date,
    extractionDate: options.date,
    deliverySha256: extractSha256,
    deliveryReportSha256: createHash('sha256')
      .update(JSON.stringify(extract.extraction ?? {}))
      .digest('hex'),
    deliveryUri: `urn:observatorio:entrega:bolivia-salud-osm:${options.date}`,
    upstreamDatasets: [
      extract.extraction?.source ?? 'https://download.geofabrik.de/south-america/',
    ],
    licences: ['ODbL-1.0'],
    geofenceMethod: 'country_polygon',
    countryCode: 'BO',
    catalogueFamilies: catalogue.size,
  };

  await mkdir(options.out, { recursive: true });
  for (const stale of await readdir(options.out)) {
    if (stale.endsWith('.json')) await unlink(join(options.out, stale));
  }
  const pieces = Math.ceil(delivery.places.length / PLACES_PER_PIECE);
  for (let piece = 0; piece < pieces; piece += 1) {
    const places = delivery.places.slice(piece * PLACES_PER_PIECE, (piece + 1) * PLACES_PER_PIECE);
    const body = { dataset: 'bolivia-national-poi-v3', provenance, places };
    const name = `health-poi-${String(piece).padStart(3, '0')}.json`;
    await writeFile(join(options.out, name), `${JSON.stringify(body)}\n`, 'utf8');
  }
  process.stdout.write(`\nsiembra escrita: ${pieces} piezas en ${options.out}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
