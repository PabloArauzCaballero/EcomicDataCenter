#!/usr/bin/env node
/**
 * Builds a seed from a SEPREC delivery of registered establishments.
 *
 * Usage:
 *   node scripts/places/build-registry-poi-seed.mjs \
 *     --registros <delivery JSON> \
 *     --out <seed directory to write> \
 *     [--date <processing date, YYYY-MM-DD>]
 *
 * It compares against every place seed already in the repository — by
 * identifier, so the same register does not land twice, and by name and
 * distance, so a shop the map already holds is flagged rather than counted
 * twice. What it keeps and what it drops is decided in
 * `read-registry-delivery.mjs`, and every drop is counted and printed.
 *
 * The output directory is replaced whole. Point it at a directory of its own:
 * pointing it at another delivery's seed would delete that seed.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexHeldPlaces, readHeldPlacesForComparison } from './read-expansion-delivery.mjs';
import { readRegistryDelivery } from './read-registry-delivery.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOT = join(ROOT, 'src/database/seeds/boot');
const PLACES_PER_PIECE = 1200;

function readArguments(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith('--')) throw new Error(`unexpected argument ${argv[index]}`);
    options.set(argv[index].slice(2), argv[index + 1]);
  }
  for (const required of ['registros', 'out']) {
    if (!options.get(required)) throw new Error(`--${required} is required`);
  }
  return {
    registros: options.get('registros'),
    out: resolve(options.get('out')),
    date: options.get('date') ?? '2026-09-13',
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
  const bytes = await readFile(options.registros);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const parsed = JSON.parse(bytes.toString('utf8'));
  // La entrega no trae un informe aparte: su bloque `metadata` es el informe.
  const reportSha256 = createHash('sha256')
    .update(JSON.stringify(parsed.metadata ?? {}))
    .digest('hex');

  const held = [];
  for (const directory of await heldSeedDirectories(options.out)) {
    held.push(...(await readHeldPlacesForComparison(directory, readdir, join)));
  }
  const heldIds = new Set(held.map((place) => place.placeId));
  const delivery = await readRegistryDelivery(options.registros, heldIds, indexHeldPlaces(held));

  const { rejected } = delivery;
  process.stdout.write(`huella de la entrega:     ${sha256}\n`);
  process.stdout.write(`registros leidos:         ${delivery.read}\n`);
  process.stdout.write(`lugares ya guardados:     ${held.length}\n`);
  process.stdout.write(`  ya estaban en la base:  ${rejected.alreadyHeld}\n`);
  process.stdout.write(`  vivienda, no local:     ${rejected.residence}\n`);
  process.stdout.write(`  coordenada imposible:   ${rejected.offPlanet}\n`);
  process.stdout.write(`  fuera de Bolivia:       ${rejected.outsideCountry}\n`);
  process.stdout.write(`  lejos de su municipio:  ${rejected.farFromMunicipality}\n`);
  process.stdout.write(`se escriben:              ${delivery.places.length}\n`);
  process.stdout.write(`  parecidos a uno guardado: ${delivery.resembling}\n`);

  if (delivery.places.length === 0) {
    process.stdout.write('\nNo hay nada que escribir.\n');
    process.exitCode = 1;
    return;
  }

  const provenance = {
    publishers: ['SEPREC'],
    release: options.date,
    extractionDate: options.date,
    deliverySha256: sha256,
    deliveryReportSha256: reportSha256,
    deliveryUri: `urn:observatorio:entrega:seprec-adicionales:${options.date}`,
    upstreamDatasets: ['https://servicios.seprec.gob.bo/'],
    licences: ['informacion publica del directorio SEPREC; redistribucion no verificada'],
    geofenceMethod: 'declared_municipality',
    countryCode: 'BO',
    catalogueFamilies: 201,
  };

  await mkdir(options.out, { recursive: true });
  for (const stale of await readdir(options.out)) {
    if (stale.endsWith('.json')) await unlink(join(options.out, stale));
  }
  const pieces = Math.ceil(delivery.places.length / PLACES_PER_PIECE);
  for (let piece = 0; piece < pieces; piece += 1) {
    const places = delivery.places.slice(piece * PLACES_PER_PIECE, (piece + 1) * PLACES_PER_PIECE);
    const body = { dataset: 'bolivia-national-poi-v3', provenance, places };
    const name = `registry-additional-poi-${String(piece).padStart(3, '0')}.json`;
    await writeFile(join(options.out, name), `${JSON.stringify(body)}\n`, 'utf8');
  }
  process.stdout.write(`\nsiembra escrita: ${pieces} piezas en ${options.out}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
