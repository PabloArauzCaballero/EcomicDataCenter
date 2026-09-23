#!/usr/bin/env node
/**
 * Builds the seed of transport places read live from OpenStreetMap.
 *
 * Usage:
 *   node scripts/places/build-transport-poi-seed.mjs \
 *     --osm-dir   <directorio con la descarga de download-transport-osm.mjs> \
 *     --catalogue scripts/places/catalogue/bolivia-place-families.json \
 *     --out       src/database/seeds/boot/bolivia-transport-poi \
 *     [--date 2026-09-23] [--max-paradas <tope opcional de PARADA_BUS/PARADA_TRUFI>]
 *
 * Sigue el mismo patron que `build-registry-poi-seed.mjs`: compara contra
 * todo lugar que el repositorio ya tiene guardado, por identificador y por
 * nombre y distancia, y no escribe nada si el catalogo deja alguna familia
 * sin definir. La diferencia es la fuente: no hay una entrega firmada que
 * verificar, hay archivos que este mismo script (via el descargador) trajo de
 * Overpass, cada uno con su huella registrada en su manifiesto.
 *
 * `--max-paradas` existe porque las paradas de autobus pueden ser miles y
 * nadie pidio cargarlas todas sin mirar: si se pasa, se ordenan por
 * identificador (para que el resultado sea reproducible) y solo entran las
 * primeras. Sin la opcion, entran todas y el resumen dice cuantas fueron.
 */

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexHeldPlaces, readHeldPlacesForComparison } from './read-expansion-delivery.mjs';
import { readFamilyCatalogue } from './read-family-catalogue.mjs';
import { classifyTransportElements, readTransportOsmFiles, sha256Of } from './read-transport-osm.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOT = join(ROOT, 'src/database/seeds/boot');
const PLACES_PER_PIECE = 1200;
const PARADA_FAMILIES = new Set(['PARADA_BUS', 'PARADA_TRUFI']);

function readArguments(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith('--')) throw new Error(`unexpected argument ${argv[index]}`);
    options.set(argv[index].slice(2), argv[index + 1]);
  }
  for (const required of ['osm-dir', 'catalogue', 'out']) {
    if (!options.get(required)) throw new Error(`--${required} is required`);
  }
  return {
    osmDir: resolve(options.get('osm-dir')),
    catalogue: options.get('catalogue'),
    out: resolve(options.get('out')),
    date: options.get('date') ?? '2026-09-23',
    maxParadas: options.get('max-paradas') ? Number(options.get('max-paradas')) : null,
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

/** El mapa codigo -> `decided_by`, leido del catalogo unido tal cual esta en disco. */
async function readDecisions(path) {
  if (!path.toLowerCase().endsWith('.json')) return new Map();
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  return new Map((parsed.familias ?? []).map((family) => [family.code, family.decided_by]));
}

/** Cuenta las filas por un campo dado, agrupando `null` bajo una etiqueta explicita. */
function countBy(places, field, whenNull) {
  const counts = new Map();
  for (const place of places) {
    const key = place[field] ?? whenNull;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((one, other) => other[1] - one[1]);
}

async function main() {
  const options = readArguments(process.argv.slice(2));

  const manifestPath = (await readdir(options.osmDir)).find((name) =>
    name.startsWith('osm-transporte-manifiesto-'),
  );
  const files = (await readdir(options.osmDir))
    .filter((name) => name.endsWith('.json') && !name.startsWith('osm-transporte-manifiesto-'))
    .sort()
    .map((name) => join(options.osmDir, name));
  if (files.length === 0) throw new Error(`no hay archivos de descarga en ${options.osmDir}`);

  const fileHashes = {};
  for (const file of files) fileHashes[file] = await sha256Of(file);
  const deliverySha256 = createHash('sha256')
    .update(JSON.stringify(fileHashes, Object.keys(fileHashes).sort()))
    .digest('hex');

  const catalogue = await readFamilyCatalogue(options.catalogue);
  const decisions = await readDecisions(options.catalogue);

  const held = [];
  for (const directory of await heldSeedDirectories(options.out)) {
    held.push(...(await readHeldPlacesForComparison(directory, readdir, join)));
  }
  const heldIds = new Set(held.map((place) => place.placeId));
  const heldGrid = indexHeldPlaces(held);

  const { elements, read } = await readTransportOsmFiles(files);
  const { places, rejected, missingFamilies, resembling } = classifyTransportElements(
    elements,
    catalogue,
    decisions,
    heldIds,
    heldGrid,
  );

  process.stdout.write(`archivos leidos:           ${files.length}\n`);
  process.stdout.write(`elementos leidos (dedup.): ${elements.length} (${read} antes de deduplicar)\n`);
  process.stdout.write(`lugares ya guardados:      ${held.length}\n`);
  process.stdout.write(`  ya estaban en la base:   ${rejected.alreadyHeld}\n`);
  process.stdout.write(`  coordenada imposible:    ${rejected.offPlanet}\n`);
  process.stdout.write(`  fuera de Bolivia:        ${rejected.outsideCountry}\n`);
  process.stdout.write(`  pais vecino por etiqueta:${String(rejected.paisVecinoPorEtiqueta).padStart(6)}\n`);
  process.stdout.write(`  sin etiqueta reconocida: ${rejected.sinFamiliaReconocida}\n`);
  process.stdout.write(`  sin nombre publicable:   ${rejected.sinNombrePublicable}\n`);
  process.stdout.write(`clasificables:             ${places.length}\n`);
  process.stdout.write(`  parecidos a uno guardado:${String(resembling).padStart(6)}\n`);

  if (missingFamilies.size > 0) {
    const missing = [...missingFamilies].map(([code, seen]) => ({ code, records: seen.records }));
    const report = join(ROOT, 'artifacts/transport-poi-missing-families.json');
    await mkdir(dirname(report), { recursive: true });
    await writeFile(report, `${JSON.stringify(missing, null, 2)}\n`, 'utf8');
    process.stderr.write(
      `\nel catalogo no define ${missing.length} familias. Estan en ${report}. No se escribe nada.\n`,
    );
    process.exitCode = 1;
    return;
  }

  let written = places;
  let paradasOmitted = 0;
  const paradas = places.filter((place) => PARADA_FAMILIES.has(place.entityFamily));
  if (options.maxParadas !== null && paradas.length > options.maxParadas) {
    const keepIds = new Set(
      [...paradas]
        .sort((one, other) => one.placeId.localeCompare(other.placeId))
        .slice(0, options.maxParadas)
        .map((place) => place.placeId),
    );
    written = places.filter(
      (place) => !PARADA_FAMILIES.has(place.entityFamily) || keepIds.has(place.placeId),
    );
    paradasOmitted = paradas.length - options.maxParadas;
  }

  process.stdout.write(`\nparadas de bus/trufi leidas: ${paradas.length}\n`);
  if (paradasOmitted > 0) {
    process.stdout.write(`  omitidas por --max-paradas: ${paradasOmitted}\n`);
  }
  process.stdout.write('\npor familia:\n');
  for (const [family, count] of countBy(written, 'entityFamily')) {
    process.stdout.write(`  ${family.padEnd(40)} ${count}\n`);
  }
  process.stdout.write('\nparadas por ciudad declarada en la etiqueta (addr:city):\n');
  for (const [city, count] of countBy(paradas, 'locality', 'sin_ciudad_en_la_etiqueta')) {
    process.stdout.write(`  ${String(city).padEnd(30)} ${count}\n`);
  }

  if (written.length === 0) {
    process.stdout.write('\nNo hay nada que escribir.\n');
    process.exitCode = 1;
    return;
  }

  const provenance = {
    publishers: ['OpenStreetMap contributors'],
    release: options.date,
    extractionDate: options.date,
    deliverySha256,
    deliveryReportSha256: createHash('sha256').update(manifestPath ?? '').digest('hex'),
    deliveryUri: `urn:observatorio:entrega:transporte-osm-overpass:${options.date}`,
    upstreamDatasets: ['https://overpass-api.de/api/interpreter'],
    licences: ['ODbL-1.0'],
    geofenceMethod: 'country_polygon',
    countryCode: 'BO',
    catalogueFamilies: catalogue.size,
  };

  await mkdir(options.out, { recursive: true });
  for (const stale of await readdir(options.out)) {
    if (stale.endsWith('.json')) await unlink(join(options.out, stale));
  }
  const pieces = Math.ceil(written.length / PLACES_PER_PIECE);
  for (let piece = 0; piece < pieces; piece += 1) {
    const slice = written.slice(piece * PLACES_PER_PIECE, (piece + 1) * PLACES_PER_PIECE);
    const body = { dataset: 'bolivia-national-poi-v3', provenance, places: slice };
    const name = `transport-poi-${String(piece).padStart(3, '0')}.json`;
    await writeFile(join(options.out, name), `${JSON.stringify(body)}\n`, 'utf8');
  }
  process.stdout.write(`\nsiembra escrita: ${written.length} lugares en ${pieces} piezas en ${options.out}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
