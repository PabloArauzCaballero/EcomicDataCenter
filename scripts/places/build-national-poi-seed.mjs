#!/usr/bin/env node
/**
 * Builds the national place seed from the delivery, or refuses to.
 *
 * Usage:
 *   node scripts/places/build-national-poi-seed.mjs \
 *     --delivery <unpacked parte_* directory> \
 *     --metadata <metadatos directory of the delivery> \
 *     --catalogue <family catalogue, CSV or JSON> \
 *     [--held <existing place seed directory>] \
 *     [--out <seed directory to write>] \
 *     [--gaps <path for the missing-family report>]
 *
 * It writes nothing when the catalogue does not define every family the
 * delivery uses. That is the point of the script and not a limitation of it:
 * the fields the catalogue supplies include whether a Bolivian regulator
 * licenses the activity, and a seed built on a guessed value would publish an
 * invented licence status for places nobody checked. What it writes instead is
 * the list of families that are missing, with the counts and the publisher
 * categories behind each one, which is what commissioning the catalogue needs.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFamilyCatalogue } from './read-family-catalogue.mjs';
import { readHeldPlaceIds, readNationalDelivery } from './read-national-delivery.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLACES_PER_PIECE = 1200;

function readArguments(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith('--')) throw new Error(`unexpected argument ${argv[index]}`);
    options.set(argv[index].slice(2), argv[index + 1]);
  }
  for (const required of ['delivery', 'metadata', 'catalogue']) {
    if (!options.get(required)) throw new Error(`--${required} is required`);
  }
  return {
    delivery: options.get('delivery'),
    metadata: options.get('metadata'),
    catalogue: options.get('catalogue'),
    held: options.get('held') ?? join(ROOT, 'src/database/seeds/boot/bolivia-poi'),
    out: options.get('out') ?? join(ROOT, 'src/database/seeds/boot/bolivia-national-poi'),
    gaps: options.get('gaps') ?? join(ROOT, 'artifacts/national-poi-missing-families.json'),
  };
}

/**
 * What the observatory can prove it received.
 *
 * The nine parts arrive with their own SHA-256 manifest, so the delivery has a
 * fingerprint that does not depend on how the parts were unpacked or on the
 * order a directory listing returns them in. It is the hash of the nine hashes,
 * which is reproducible by anyone holding the same delivery.
 */
async function deliveryFingerprint(metadataDirectory) {
  const manifestPath = join(metadataDirectory, 'manifest_partes_sha256.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const ordered = [...manifest].sort((left, right) => left.archivo.localeCompare(right.archivo));
  const digest = createHash('sha256');
  for (const part of ordered) digest.update(`${part.archivo}:${part.sha256}\n`);
  return digest.digest('hex');
}

async function readDeliveryReport(metadataDirectory) {
  const files = await readdir(metadataDirectory);
  const name = files.find((file) => file.startsWith('reporte_') && file.endsWith('.json'));
  if (!name) throw new Error('the delivery metadata holds no report');
  const raw = await readFile(join(metadataDirectory, name), 'utf8');
  return { report: JSON.parse(raw), sha256: createHash('sha256').update(raw).digest('hex') };
}

/** Everything about the delivery that is true of every place in it. */
function provenanceOf(report, fingerprint, reportSha256, catalogue) {
  return {
    publishers: ['Overture Maps Foundation', 'OpenStreetMap contributors'],
    release: report.fuente_overture_release,
    extractionDate: report.fecha_extraccion,
    deliverySha256: fingerprint,
    deliveryReportSha256: reportSha256,
    // The package was delivered as files, not fetched from an address. Naming
    // one of the upstream datasets as the origin of all of them would describe
    // half the corpus with the other half's provenance, so the artifact is
    // named for what it is and each place keeps its own dataset address.
    deliveryUri: `urn:observatorio:entrega:bolivia-nacional:${report.fecha_extraccion}`,
    upstreamDatasets: [
      'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-08-19.0/theme=places/type=place/',
      'https://download.geofabrik.de/south-america/bolivia-260909-free.shp.zip',
    ],
    licences: ['CDLA-Permissive-2.0', 'ODbL-1.0'],
    geofenceMethod: 'country_polygon',
    countryCode: 'BO',
    catalogueFamilies: catalogue.size,
  };
}

/** The families the catalogue does not define, as the request to define them. */
async function writeGapReport(path, missingFamilies, report) {
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
      'Familias que la entrega usa y el catalogo no define. Cada entrada necesita group, commercial_role, is_regulated y official_validation_source en el formato del anexo C. Sin ellas la siembra no se construye.',
    catalogoDeclaradoPorLaEntrega: report.familias_catalogo_total,
    familiasSinDefinir: families.length,
    registrosAfectados: families.reduce((total, family) => total + family.records, 0),
    familias: families,
  };
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

/** Replaces the seed directory, so a rebuild never leaves a stale piece behind. */
async function writePieces(directory, dataset, provenance, places) {
  await mkdir(directory, { recursive: true });
  for (const stale of await readdir(directory)) {
    if (stale.endsWith('.json')) await unlink(join(directory, stale));
  }
  const pieces = Math.ceil(places.length / PLACES_PER_PIECE);
  for (let piece = 0; piece < pieces; piece += 1) {
    const slice = places.slice(piece * PLACES_PER_PIECE, (piece + 1) * PLACES_PER_PIECE);
    const name = `national-poi-${String(piece).padStart(3, '0')}.json`;
    await writeFile(
      join(directory, name),
      `${JSON.stringify({ dataset, provenance, places: slice })}\n`,
      'utf8',
    );
  }
  return pieces;
}

function reportCounts(read, alreadyHeld, catalogue, places) {
  process.stdout.write(`entrega leida:        ${read} registros\n`);
  process.stdout.write(`ya en la base:        ${alreadyHeld}\n`);
  process.stdout.write(`familias en catalogo: ${catalogue.size}\n`);
  process.stdout.write(`lugares clasificados: ${places.length}\n`);
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  const catalogue = await readFamilyCatalogue(options.catalogue);
  const held = await readHeldPlaceIds(options.held);
  const { report, sha256: reportSha256 } = await readDeliveryReport(options.metadata);
  const fingerprint = await deliveryFingerprint(options.metadata);

  const delivery = await readNationalDelivery(options.delivery, catalogue, held);
  reportCounts(delivery.read, delivery.alreadyHeld, catalogue, delivery.places);

  if (delivery.missingFamilies.size > 0) {
    await writeGapReport(options.gaps, delivery.missingFamilies, report);
    const seen = [...delivery.missingFamilies.values()];
    const affected = seen.reduce((total, family) => total + family.records, 0);
    process.stdout.write('\nNO SE ESCRIBE LA SIEMBRA.\n');
    process.stdout.write(
      `${delivery.missingFamilies.size} familias sin definir, ${affected} registros.\n`,
    );
    process.stdout.write(`Lo que falta esta en ${options.gaps}\n`);
    process.exitCode = 1;
    return;
  }

  const provenance = provenanceOf(report, fingerprint, reportSha256, catalogue);
  const pieces = await writePieces(
    options.out,
    'bolivia-national-poi-v3',
    provenance,
    delivery.places,
  );
  process.stdout.write(`\nsiembra escrita: ${pieces} piezas en ${options.out}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
