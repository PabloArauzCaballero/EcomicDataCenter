#!/usr/bin/env node
/**
 * Builds a seed from the ANH list of licensed fuel stations.
 *
 * Usage:
 *   node scripts/places/build-anh-poi-seed.mjs \
 *     --lista <national page saved from contenido.php?s=40&R=1&D=0> \
 *     --catalogue scripts/places/catalogue/bolivia-place-families.json \
 *     --schools src/database/seeds/boot/bolivia-sie-poi \
 *     --out src/database/seeds/boot/bolivia-anh-poi \
 *     --retrieved <ISO time of the download> \
 *     [--expected-sha256 <fingerprint the runbook names>]
 *
 * `--schools` is the SIE seed, built first: it is the reference each station's
 * declared department is checked against. What is kept and what is dropped is
 * decided in `read-anh-delivery.mjs`; every drop is counted and printed here.
 */

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { readAnhDelivery } from './read-anh-delivery.mjs';
import { readFamilyCatalogue } from './read-family-catalogue.mjs';
import { departmentVoter, readSchoolReferences } from './read-official-places.mjs';
import {
  heldPlaces,
  readArguments,
  readDownload,
  report,
  writeSeed,
} from './write-official-poi-seed.mjs';

const SOURCE_URL = 'https://www.anh.gob.bo/w2019/contenido.php?s=40&R=1&D=0';

async function main() {
  const options = readArguments(process.argv.slice(2), [
    'lista',
    'catalogue',
    'schools',
    'out',
    'retrieved',
  ]);
  const out = resolve(options.get('out'));
  const retrievedAt = new Date(options.get('retrieved')).toISOString().replace('.000Z', 'Z');
  const download = await readDownload(options.get('lista'), options.get('expected-sha256'));
  const catalogue = await readFamilyCatalogue(options.get('catalogue'));
  const vote = departmentVoter(await readSchoolReferences(resolve(options.get('schools'))));
  const held = await heldPlaces(out);
  const delivery = readAnhDelivery(download.text, catalogue, held, vote, {
    retrievedAt,
    sourceUrl: SOURCE_URL,
  });

  const { rejected } = delivery;
  process.stdout.write(`huella de la descarga:            ${download.sha256}\n`);
  report('estaciones leidas:', delivery.read);
  report('lugares ya guardados:', held.count);
  report('  ya estaban en la base:', rejected.alreadyHeld);
  report('  sin codigo de licencia:', rejected.withoutCode);
  report('  sin coordenada o fuera:', rejected.withoutPosition);
  report('  en otro departamento:', rejected.otherDepartment);
  for (const row of delivery.disagreements) {
    process.stdout.write(`    ${row.code}: declara ${row.declared}, escuelas en ${row.voted}\n`);
  }
  report('se escriben:', delivery.places.length);
  report('  sin escuelas cerca para cotejar:', delivery.unchecked);
  report('  parecidos a uno guardado:', delivery.resembling);

  if (delivery.places.length === 0) {
    process.stdout.write('\nNo hay nada que escribir.\n');
    process.exitCode = 1;
    return;
  }
  const provenance = {
    publishers: ['ANH'],
    release: retrievedAt.slice(0, 10),
    extractionDate: retrievedAt.slice(0, 10),
    deliverySha256: download.sha256,
    // La pagina no trae informe aparte: su titulo y su encabezado de tabla son
    // lo que dice que lista es y con que criterio.
    deliveryReportSha256: createHash('sha256')
      .update(download.text.match(/<h1[\s\S]*?<\/h1>|<thead>[\s\S]*?<\/thead>/gu)?.join('') ?? '')
      .digest('hex'),
    deliveryUri: SOURCE_URL,
    upstreamDatasets: ['https://www.anh.gob.bo/w2019/contenido.php?s=40&R=1&D=7'],
    licences: ['lista publica de operadores de la ANH; redistribucion no verificada'],
    geofenceMethod: 'declared_department',
    countryCode: 'BO',
    catalogueFamilies: catalogue.size,
  };
  const pieces = await writeSeed(out, 'anh-poi', provenance, delivery.places);
  process.stdout.write(`\nsiembra escrita: ${pieces} piezas en ${out}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
