#!/usr/bin/env node
/**
 * Builds the Cochabamba and La Paz expansion seed from the delivered altas.
 *
 * Usage:
 *   node scripts/places/build-expansion-poi-seed.mjs \
 *     --altas <altas JSON as delivered, or the altas_propuestas directory> \
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
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
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
/** El informe que acompano a la primera ampliacion, hasheado una vez. */
const REPORT_SHA256 = '902aff872ce65ec7ec10efd4a2dbe3ba9a2c08529fa7a41f59a50248612b23fb';

function readArguments(argv) {
  const options = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`unexpected argument ${argument}`);
    if (
      argument === '--partial' ||
      argument === '--stable-only' ||
      argument === '--only-registry'
    ) {
      flags.add(argument.slice(2));
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
    stableOnly: flags.has('stable-only'),
    onlyRegistry: flags.has('only-registry'),
    source: options.get('source') ?? SOURCE,
    release: options.get('release') ?? '2026-09-12',
    report: options.get('report'),
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

/**
 * The altas read from the signed lots of the delivery instead of from the
 * single file it also published.
 *
 * The consolidated JSON of the Cochabamba and La Paz expansion lives at a host
 * that promises no permanence, and it stopped resolving. The same 5.721 rows
 * travel inside the delivery's own ZIP, split into seven lots, and that ZIP
 * carries a manifest with the hash of each one — so every byte read here is
 * checked against what the delivery signed, which is more than the single file
 * allowed: it was checked against a hash published beside it.
 *
 * The fingerprint is the hash of those hashes, the same construction the
 * national delivery uses, so it is reproducible by anyone holding the ZIP and
 * does not depend on how the lots were unpacked or listed.
 */
async function fingerprintOfLots(directory) {
  const manifestPath = join(directory, '..', 'metadatos', 'manifest_sha256.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const declared = new Map(
    manifest.map((entry) => [entry.archivo.replace(/\\/gu, '/'), entry.sha256]),
  );

  const records = [];
  const checked = [];
  for (const name of (await readdir(directory)).filter((file) => file.endsWith('.json')).sort()) {
    const bytes = await readFile(join(directory, name));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const key = `altas_propuestas/${name}`;
    const promised = declared.get(key);
    if (!promised) throw new Error(`el manifiesto de la entrega no menciona ${key}`);
    if (promised !== sha256) throw new Error(`${key} no coincide con el manifiesto: ${sha256}`);
    checked.push(`${key}:${sha256}`);
    records.push(...JSON.parse(bytes.toString('utf8')).registros);
  }
  if (checked.length === 0) throw new Error(`no hay lotes de altas en ${directory}`);

  const digest = createHash('sha256');
  for (const line of checked.sort()) digest.update(`${line}\n`);
  return { sha256: digest.digest('hex'), records, lots: checked.length };
}

/** Everything about the delivery that is true of every place in it. */
function provenanceOf(sha256, catalogue, options, reportSha256) {
  return {
    publishers: options.onlyRegistry ? ['SEPREC'] : ['OpenStreetMap contributors'],
    // OpenStreetMap publica sin version; lo que identifica esta lectura es el
    // dia del snapshot, que es lo que cada fila trae en `timestamp_osm_base`.
    release: options.release,
    extractionDate: options.release,
    deliverySha256: sha256,
    deliveryReportSha256: reportSha256,
    deliveryUri: options.source,
    upstreamDatasets: options.onlyRegistry
      ? ['https://servicios.seprec.gob.bo/']
      : ['https://www.openstreetmap.org/'],
    /*
     * La del registro no es una licencia abierta y no se la disfraza de una:
     * se guarda la frase que la entrega escribio, para que quien republique
     * esto lea la advertencia antes que el dato.
     */
    licences: options.onlyRegistry
      ? ['informacion publica del directorio SEPREC; redistribucion no verificada']
      : ['ODbL-1.0'],
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
async function writePieces(directory, provenance, places, prefix = 'expansion-poi') {
  await mkdir(directory, { recursive: true });
  for (const stale of await readdir(directory)) {
    if (stale.endsWith('.json')) await unlink(join(directory, stale));
  }
  const pieces = Math.ceil(places.length / PLACES_PER_PIECE);
  for (let piece = 0; piece < pieces; piece += 1) {
    const slice = places.slice(piece * PLACES_PER_PIECE, (piece + 1) * PLACES_PER_PIECE);
    const body = { dataset: 'bolivia-national-poi-v3', provenance, places: slice };
    await writeFile(
      join(directory, `${prefix}-${String(piece).padStart(3, '0')}.json`),
      `${JSON.stringify(body)}\n`,
      'utf8',
    );
  }
  return pieces;
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  const fromLots = (await stat(options.altas)).isDirectory();
  const lots = fromLots ? await fingerprintOfLots(options.altas) : null;
  const sha256 = lots ? lots.sha256 : await fingerprint(options.altas, options.expectedSha256);
  if (lots) {
    process.stdout.write(`lotes verificados:    ${lots.lots}\n`);
  }
  const catalogue = await readFamilyCatalogue(options.catalogue);
  const heldPlaces = await readHeldPlacesForComparison(options.held, readdir, join);
  const grid = indexHeldPlaces(heldPlaces);

  const reportSha256 = options.report
    ? createHash('sha256')
        .update(await readFile(options.report))
        .digest('hex')
    : REPORT_SHA256;

  const delivery = await readExpansionDelivery(
    lots ? lots.records : options.altas,
    catalogue,
    grid,
    {
      stableOnly: options.stableOnly,
      onlyRegistry: options.onlyRegistry,
    },
  );
  const missing = [...delivery.missingFamilies.values()];
  const affected = missing.reduce((total, family) => total + family.records, 0);

  process.stdout.write(`huella verificada:    ${sha256}\n`);
  process.stdout.write(`altas leidas:         ${delivery.read}\n`);
  process.stdout.write(`lugares ya guardados: ${heldPlaces.length}\n`);
  process.stdout.write(`clasificados:         ${delivery.places.length}\n`);
  process.stdout.write(
    `sin familia:          ${affected} en ${delivery.missingFamilies.size} familias\n`,
  );
  process.stdout.write(`esperan al catalogo:  ${delivery.awaitingRefinement}\n`);
  process.stdout.write(`sin licencia abierta: ${delivery.withoutOpenLicence}\n`);
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

  const pieces = await writePieces(
    options.out,
    provenanceOf(sha256, catalogue, options, reportSha256),
    delivery.places,
    options.onlyRegistry ? 'registry-poi' : 'expansion-poi',
  );
  process.stdout.write(`\nsiembra escrita: ${pieces} piezas en ${options.out}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
