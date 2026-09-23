#!/usr/bin/env node
/**
 * Construye la siembra de comercio y servicios de Santa Cruz de la Sierra
 * desde los crudos que descargó `fetch-scz-enrichment-osm.mjs`.
 *
 * Uso:
 *   node scripts/places/build-scz-enrichment-poi-seed.mjs \
 *     --crudos    <carpeta con manifiesto.json y los tres grupos> \
 *     --catalogue scripts/places/catalogue/bolivia-place-families.json \
 *     [--out      src/database/seeds/boot/bolivia-scz-enrichment-poi] \
 *     [--report   artifacts/scz-enrichment-poi-report.json]
 *
 * Cada crudo se comprueba contra la huella que el manifiesto anotó al
 * descargarlo. Lo que el observatorio ya tiene se lee de todas las siembras
 * de lugares que hay en el disco —el país y las tres ciudades— menos la que
 * se está construyendo, igual que la ampliación por rubros: si no, reconstruir
 * la compararía consigo misma y se vaciaría. No escribe nada si la tabla usa
 * una familia que el catálogo no define.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFamilyCatalogue } from './read-family-catalogue.mjs';
import { indexHeld, readSczEnrichmentOsm } from './read-scz-enrichment-osm.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOT = join(ROOT, 'src/database/seeds/boot');
const PLACES_PER_PIECE = 1200;

function readArguments(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith('--')) throw new Error(`argumento inesperado ${argv[index]}`);
    options.set(argv[index].slice(2), argv[index + 1]);
  }
  for (const required of ['crudos', 'catalogue']) {
    if (!options.get(required)) throw new Error(`--${required} es obligatorio`);
  }
  return {
    crudos: resolve(options.get('crudos')),
    catalogue: resolve(options.get('catalogue')),
    out: resolve(options.get('out') ?? join(BOOT, 'bolivia-scz-enrichment-poi')),
    report: resolve(
      options.get('report') ?? join(ROOT, 'artifacts/scz-enrichment-poi-report.json'),
    ),
  };
}

/** Los crudos, comprobados contra el manifiesto que se escribió al bajarlos. */
async function verifiedFiles(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'manifiesto.json'), 'utf8'));
  const files = [];
  const lines = [];
  for (const entry of manifest.archivos) {
    const path = join(directory, entry.archivo);
    const sha256 = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
    if (sha256 !== entry.sha256) {
      throw new Error(`${entry.archivo} no coincide con el manifiesto: ${sha256}`);
    }
    files.push({ path, grupo: entry.grupo, snapshot: entry.snapshotOsm });
    lines.push(`${entry.archivo}:${sha256}`);
  }
  if (files.length !== 4) throw new Error(`se esperaban 4 grupos y hay ${files.length}`);
  const digest = createHash('sha256');
  for (const line of lines.sort()) digest.update(`${line}\n`);
  return { files, sha256: digest.digest('hex'), manifest };
}

/**
 * Lo que el corpus ya tiene: identificadores y posiciones, de todas las
 * siembras de lugares del disco salvo la propia.
 */
async function heldCorpus(out) {
  const ids = new Set();
  const places = [];
  for (const name of await readdir(BOOT)) {
    const directory = join(BOOT, name);
    if (!name.endsWith('-poi') || resolve(directory) === out) continue;
    for (const file of (await readdir(directory)).filter((one) => one.endsWith('.json'))) {
      const seed = JSON.parse(await readFile(join(directory, file), 'utf8'));
      for (const place of seed.places ?? []) {
        const id = String(place.placeId);
        ids.add(id);
        const geofabrik = /^geofabrik:[a-z_]+:(\d+)$/u.exec(id);
        if (geofabrik) ids.add(`osm:*:${geofabrik[1]}`);
        places.push({
          placeId: id,
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
        });
      }
    }
  }
  return { ids, places };
}

async function writePieces(directory, provenance, places) {
  await mkdir(directory, { recursive: true });
  for (const stale of await readdir(directory)) {
    if (stale.endsWith('.json')) await unlink(join(directory, stale));
  }
  const pieces = Math.ceil(places.length / PLACES_PER_PIECE);
  for (let piece = 0; piece < pieces; piece += 1) {
    const slice = places.slice(piece * PLACES_PER_PIECE, (piece + 1) * PLACES_PER_PIECE);
    await writeFile(
      join(directory, `scz-enrichment-poi-${String(piece).padStart(3, '0')}.json`),
      `${JSON.stringify({ dataset: 'bolivia-national-poi-v3', provenance, places: slice })}\n`,
      'utf8',
    );
  }
  return pieces;
}

function tally(places, key) {
  const counts = {};
  for (const place of places) counts[key(place)] = (counts[key(place)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((one, other) => other[1] - one[1]));
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  const { files, sha256, manifest } = await verifiedFiles(options.crudos);
  const catalogueBytes = await readFile(options.catalogue);
  const catalogue = await readFamilyCatalogue(options.catalogue);
  const decisions = new Map(
    (JSON.parse(catalogueBytes.toString('utf8')).familias ?? []).map((one) => [
      one.code,
      one.decided_by,
    ]),
  );

  const held = await heldCorpus(options.out);
  const read = await readSczEnrichmentOsm(
    files,
    catalogue,
    decisions,
    held.ids,
    indexHeld(held.places),
  );

  process.stdout.write(`huella de los crudos:  ${sha256}\n`);
  process.stdout.write(`lugares ya guardados:  ${held.places.length}\n`);
  process.stdout.write(`nuevos:                ${read.places.length}\n`);
  process.stdout.write(`descartados:           ${JSON.stringify(read.rejected)}\n`);
  process.stdout.write(`parecidos a uno ya guardado: ${read.resembling}\n`);

  if (read.missingFamilies.size > 0) {
    process.stdout.write(
      `\nNO SE ESCRIBE LA SIEMBRA. El catalogo no define: ${[...read.missingFamilies.keys()].join(', ')}\n`,
    );
    process.exitCode = 1;
    return;
  }
  if (read.places.length === 0) {
    process.stdout.write('\nNo hay nada que escribir.\n');
    process.exitCode = 1;
    return;
  }

  const places = [...read.places].sort((one, other) => one.placeId.localeCompare(other.placeId));
  const snapshots = files
    .map((file) => file.snapshot)
    .filter(Boolean)
    .sort();
  const release = (snapshots.at(-1) ?? manifest.descargado).slice(0, 10);
  const provenance = {
    publishers: ['OpenStreetMap contributors'],
    release,
    extractionDate: manifest.descargado.slice(0, 10),
    deliverySha256: sha256,
    deliveryReportSha256: createHash('sha256')
      .update(await readFile(join(options.crudos, 'manifiesto.json')))
      .digest('hex'),
    deliveryUri: `urn:observatorio:descarga:osm-overpass-santa-cruz-enriquecimiento:${manifest.descargado.slice(0, 10)}`,
    upstreamDatasets: ['https://www.openstreetmap.org'],
    licences: ['ODbL-1.0'],
    geofenceMethod: 'osm_administrative_area',
    countryCode: 'BO',
    catalogueFamilies: catalogue.size,
  };
  const pieces = await writePieces(options.out, provenance, places);

  const report = {
    _leame:
      'Medicion del enriquecimiento comercial de Santa Cruz de la Sierra desde OpenStreetMap. ' +
      '© OpenStreetMap contributors, ODbL.',
    huellaCrudos: sha256,
    crudos: files.map((file) => basename(file.path)),
    lugaresYaGuardados: held.places.length,
    nuevos: places.length,
    descartados: read.rejected,
    parecidosAUnoGuardado: read.resembling,
    porGrupo: tally(places, (place) => place.entityGroup),
    porFamilia: tally(places, (place) => place.entityFamily),
    porMetodo: tally(places, (place) => place.classificationMethod),
  };
  await mkdir(dirname(options.report), { recursive: true });
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`\nsiembra escrita: ${pieces} piezas en ${options.out}\n`);
  process.stdout.write(`informe: ${options.report}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
