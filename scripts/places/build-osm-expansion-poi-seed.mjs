#!/usr/bin/env node
/**
 * Construye la siembra de la ampliacion por rubros desde los crudos de
 * OpenStreetMap que descargo `fetch-osm-expansion.mjs`.
 *
 * Uso:
 *   node scripts/places/build-osm-expansion-poi-seed.mjs \
 *     --crudos    <carpeta con manifiesto.json y un crudo por departamento> \
 *     --catalogue scripts/places/catalogue/bolivia-place-families.json \
 *     [--out      src/database/seeds/boot/bolivia-osm-expansion-poi] \
 *     [--report   artifacts/osm-expansion-poi-report.json]
 *
 * Cada crudo se comprueba contra la huella que el manifiesto anoto al
 * descargarlo, y la siembra se firma con la huella de esas huellas, igual que
 * la entrega nacional: cualquiera con los nueve crudos puede reproducirla.
 *
 * Lo que el observatorio ya tiene se lee de todas las siembras de lugares que
 * hay en el disco, las del pais y las de tres ciudades, menos la que se esta
 * construyendo. Si no, reconstruirla la compararia consigo misma y se vaciaria.
 *
 * Como la entrega nacional, no escribe nada si el catalogo no define todas las
 * familias que la tabla de etiquetas usa.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFamilyCatalogue } from './read-family-catalogue.mjs';
import { indexHeld, readOsmExpansion } from './read-osm-expansion.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOT = join(ROOT, 'src/database/seeds/boot');
const PLACES_PER_PIECE = 1200;
const ADDITIONS_DECIDED_BY = 'ampliacion_osm_2026_09_23';

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
    out: resolve(options.get('out') ?? join(BOOT, 'bolivia-osm-expansion-poi')),
    report: resolve(options.get('report') ?? join(ROOT, 'artifacts/osm-expansion-poi-report.json')),
  };
}

/** Los crudos, comprobados contra el manifiesto que se escribio al bajarlos. */
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
    files.push({ path, department: entry.departamento, snapshot: entry.snapshotOsm });
    lines.push(`${entry.archivo}:${sha256}`);
  }
  if (files.length !== 9) throw new Error(`se esperaban 9 departamentos y hay ${files.length}`);
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
        /*
         * Geofabrik no dice si el objeto era nodo o via. Se guarda el numero
         * sin tipo, y la lectura descarta cualquier objeto con ese numero.
         */
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

/** Reemplaza la carpeta entera, para que una reconstruccion no deje piezas viejas. */
async function writePieces(directory, provenance, places) {
  await mkdir(directory, { recursive: true });
  for (const stale of await readdir(directory)) {
    if (stale.endsWith('.json')) await unlink(join(directory, stale));
  }
  const pieces = Math.ceil(places.length / PLACES_PER_PIECE);
  for (let piece = 0; piece < pieces; piece += 1) {
    const slice = places.slice(piece * PLACES_PER_PIECE, (piece + 1) * PLACES_PER_PIECE);
    await writeFile(
      join(directory, `osm-expansion-poi-${String(piece).padStart(3, '0')}.json`),
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
  const decided = JSON.parse(catalogueBytes.toString('utf8')).familias;
  const annex = new Set(
    decided.filter((one) => one.decided_by === 'anexo_A_201').map((one) => one.code),
  );
  const additions = new Set(
    decided.filter((one) => one.decided_by === ADDITIONS_DECIDED_BY).map((one) => one.code),
  );

  const held = await heldCorpus(options.out);
  const read = await readOsmExpansion(
    files,
    catalogue,
    annex,
    additions,
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

  /*
   * Orden estable por identificador: dos construcciones desde los mismos
   * crudos escriben los mismos bytes, y el registro de siembras puede comparar
   * huellas sin que el orden de Overpass cuente.
   */
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
    deliveryUri: `urn:observatorio:descarga:osm-overpass-por-rubros:${manifest.descargado.slice(0, 10)}`,
    upstreamDatasets: ['https://www.openstreetmap.org'],
    licences: ['ODbL-1.0'],
    geofenceMethod: 'osm_administrative_area',
    countryCode: 'BO',
    catalogueFamilies: catalogue.size,
  };
  const pieces = await writePieces(options.out, provenance, places);

  const report = {
    _leame:
      'Medicion de la ampliacion por rubros desde OpenStreetMap. © OpenStreetMap contributors, ODbL.',
    huellaCrudos: sha256,
    crudos: files.map((file) => basename(file.path)),
    lugaresYaGuardados: held.places.length,
    nuevos: places.length,
    descartados: read.rejected,
    parecidosAUnoGuardado: read.resembling,
    porDepartamento: tally(places, (place) => place.department),
    porGrupo: tally(places, (place) => place.entityGroup),
    porFamilia: tally(places, (place) => place.entityFamily),
    porMetodo: tally(places, (place) => place.classificationMethod),
    familiasNuevasUsadas: [...new Set(places.map((place) => place.entityFamily))]
      .filter((code) => additions.has(code))
      .sort(),
    porDepartamentoYGrupo: tally(places, (place) => `${place.department}|${place.entityGroup}`),
    porDepartamentoYFamilia: tally(places, (place) => `${place.department}|${place.entityFamily}`),
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
