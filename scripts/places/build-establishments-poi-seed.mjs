#!/usr/bin/env node
/**
 * Builds the seeds of the recovered establishments delivery of 2026-09-21.
 *
 * Usage:
 *   node scripts/places/build-establishments-poi-seed.mjs \
 *     --registros  <establecimientos_6783.json> \
 *     --catalogue  scripts/places/catalogue/bolivia-place-families.json \
 *     --out        src/database/seeds/boot/bolivia-establishments-poi \
 *     --out-restricted src/database/seeds/boot/bolivia-establishments-registry-poi \
 *     [--expected-sha256 <the delivery's own hash>] [--date 2026-09-21]
 *
 * It writes two directories because the delivery arrives under two licences,
 * and that is the same decision the SEPREC corpus already took: what does not
 * come under a verified open licence lives in a directory of its own, so that
 * withdrawing it is deleting a folder and deploying again.
 *
 *   `--out`            1.738 places read from OpenStreetMap, under ODbL-1.0.
 *   `--out-restricted` 5.011 pharmacies of the medicines agency and 34
 *                      branches an entity publishes about itself. Both are
 *                      public and neither grants a licence to redistribute.
 *
 * Every output directory is replaced whole. Point each at a directory of its
 * own: pointing one at another delivery's seed would delete that seed.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexHeldPlaces, readHeldPlacesForComparison } from './read-expansion-delivery.mjs';
import { readEstablishmentsDelivery } from './read-establishments-delivery.mjs';
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
  for (const required of ['registros', 'catalogue', 'out', 'out-restricted']) {
    if (!options.get(required)) throw new Error(`--${required} is required`);
  }
  return {
    registros: options.get('registros'),
    catalogue: options.get('catalogue'),
    open: resolve(options.get('out')),
    restricted: resolve(options.get('out-restricted')),
    expectedSha256: options.get('expected-sha256') ?? null,
    date: options.get('date') ?? '2026-09-21',
  };
}

/** Every place seed directory in the repository except the ones being written. */
async function heldSeedDirectories(written) {
  const entries = await readdir(BOOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('-poi'))
    .map((entry) => join(BOOT, entry.name))
    .filter((directory) => !written.includes(resolve(directory)));
}

/**
 * Las familias que decide el anexo de 201, leidas del propio catalogo unido.
 *
 * Sirve para una sola cosa: decir por que puente llego una fila de
 * OpenStreetMap a su familia. Un codigo que el anexo ya definia lo puso ahi un
 * puente hacia los codigos que el corpus tenia; uno que solo define el
 * catalogo de 2.330, un puente hacia ese catalogo.
 */
async function annexDecidedCodes(path) {
  if (!path.toLowerCase().endsWith('.json')) return new Set();
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  const codes = new Set();
  for (const family of parsed.familias ?? []) {
    if (family.decided_by === 'anexo_A_201') codes.add(family.code);
  }
  return codes;
}

/** Las direcciones de las que salio cada fila, sacadas de las propias filas. */
function upstreamOf(places) {
  const origins = new Set();
  for (const place of places) {
    for (const url of [place.sourceRecordUrl, place.sourceDatasetUrl]) {
      if (!url) continue;
      try {
        origins.add(new URL(url).origin);
      } catch {
        // Una direccion que no es una direccion no describe una fuente.
      }
    }
  }
  return [...origins].sort();
}

async function writeSeed(directory, name, provenance, places) {
  await mkdir(directory, { recursive: true });
  for (const stale of await readdir(directory)) {
    if (stale.endsWith('.json')) await unlink(join(directory, stale));
  }
  const pieces = Math.ceil(places.length / PLACES_PER_PIECE);
  for (let piece = 0; piece < pieces; piece += 1) {
    const slice = places.slice(piece * PLACES_PER_PIECE, (piece + 1) * PLACES_PER_PIECE);
    const body = { dataset: 'bolivia-national-poi-v3', provenance, places: slice };
    const file = `${name}-${String(piece).padStart(3, '0')}.json`;
    await writeFile(join(directory, file), `${JSON.stringify(body)}\n`, 'utf8');
  }
  return pieces;
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  const bytes = await readFile(options.registros);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  /*
   * La huella se comprueba antes de leer nada. Si el archivo no es el que la
   * entrega declara, lo que venga detras no es esta entrega.
   */
  if (options.expectedSha256 && options.expectedSha256 !== sha256) {
    throw new Error(`la entrega no coincide con la huella declarada: ${sha256}`);
  }
  const parsed = JSON.parse(bytes.toString('utf8'));
  // La entrega no trae un informe aparte: su bloque `metadata` es el informe.
  const reportSha256 = createHash('sha256')
    .update(JSON.stringify(parsed.metadata ?? {}))
    .digest('hex');

  const catalogue = await readFamilyCatalogue(options.catalogue);
  const annex = await annexDecidedCodes(options.catalogue);

  const written = [options.open, options.restricted];
  const held = [];
  for (const directory of await heldSeedDirectories(written)) {
    held.push(...(await readHeldPlacesForComparison(directory, readdir, join)));
  }
  const heldIds = new Set(held.map((place) => place.placeId));

  const delivery = await readEstablishmentsDelivery(
    options.registros,
    catalogue,
    heldIds,
    indexHeldPlaces(held),
    annex,
  );

  const { rejected } = delivery;
  process.stdout.write(`huella de la entrega:      ${sha256}\n`);
  process.stdout.write(`registros leidos:          ${delivery.read}\n`);
  process.stdout.write(`lugares ya guardados:      ${held.length}\n`);
  process.stdout.write(`  no son altas:            ${rejected.notAnAlta}\n`);
  process.stdout.write(`  ya estaban en la base:   ${rejected.alreadyHeld}\n`);
  process.stdout.write(`  coordenada imposible:    ${rejected.offPlanet}\n`);
  process.stdout.write(`  fuera de Bolivia:        ${rejected.outsideCountry}\n`);
  process.stdout.write(`  lejos de su municipio:   ${rejected.farFromMunicipality}\n`);
  process.stdout.write(`  repetidos en la entrega: ${delivery.duplicatedInDelivery}\n`);
  process.stdout.write(`se escriben:               ${delivery.places.length}\n`);
  process.stdout.write(`  parecidos a uno guardado:${String(delivery.resembling).padStart(6)}\n`);

  if (delivery.missingFamilies.size > 0) {
    const missing = [...delivery.missingFamilies]
      .map(([code, seen]) => ({ code, records: seen.records, categories: [...seen.categories] }))
      .sort((one, other) => other.records - one.records);
    const report = join(ROOT, 'artifacts/establishments-poi-missing-families.json');
    await writeFile(report, `${JSON.stringify(missing, null, 2)}\n`, 'utf8');
    process.stderr.write(
      `\nel catalogo no define ${missing.length} familias (${missing.reduce((sum, one) => sum + one.records, 0)} registros).\n` +
        `Estan en ${report}. No se escribe nada.\n`,
    );
    process.exitCode = 1;
    return;
  }

  const mapped = delivery.places.filter((place) => place.licence === 'ODbL-1.0');
  const registered = delivery.places.filter((place) => place.licence !== 'ODbL-1.0');

  const common = {
    release: options.date,
    extractionDate: options.date,
    deliverySha256: sha256,
    deliveryReportSha256: reportSha256,
    deliveryUri: `urn:observatorio:entrega:establecimientos-recuperados:${options.date}`,
    countryCode: 'BO',
    catalogueFamilies: catalogue.size,
  };

  const openPieces = await writeSeed(
    options.open,
    'establishments-poi',
    {
      ...common,
      publishers: ['OpenStreetMap contributors'],
      upstreamDatasets: upstreamOf(mapped),
      licences: ['ODbL-1.0'],
      /*
       * La entrega acota por pais y no resuelve municipio para estas filas:
       * lo unico territorial que traen es el `addr:city` que escribio quien
       * mapeo, que no es una pertenencia comprobada a ningun area.
       */
      geofenceMethod: 'country_polygon',
    },
    mapped,
  );

  const restrictedPieces = await writeSeed(
    options.restricted,
    'establishments-registry-poi',
    {
      ...common,
      publishers: ['AGEMED', 'BCP', 'Banco Economico', 'Pollos Copacabana'],
      upstreamDatasets: upstreamOf(registered),
      licences: ['sin_licencia_abierta_expresa_verificada'],
      geofenceMethod: 'declared_municipality',
    },
    registered,
  );

  process.stdout.write(`\nsiembra abierta:    ${mapped.length} lugares en ${openPieces} piezas\n`);
  process.stdout.write(
    `siembra restringida:${String(registered.length).padStart(6)} lugares en ${restrictedPieces} piezas\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
