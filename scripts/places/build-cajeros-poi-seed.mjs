#!/usr/bin/env node
/**
 * Builds a seed from the ATM map of cajerosensantacruz.tel.bo.
 *
 * Usage:
 *   node scripts/places/build-cajeros-poi-seed.mjs \
 *     --pagina <coordenadas/todos.php, saved as downloaded> \
 *     --catalogue scripts/places/catalogue/bolivia-place-families.json \
 *     --schools src/database/seeds/boot/bolivia-sie-poi \
 *     --out src/database/seeds/boot/bolivia-cajeros-poi \
 *     --retrieved <ISO time of the download> \
 *     [--expected-sha256 <fingerprint the runbook names>]
 *
 * `--schools` is the SIE seed, built first: the ANH reader and this one both
 * check a declared department against the nearest schools of that register.
 * What is kept and what is dropped is decided in `read-cajeros-delivery.mjs`.
 */

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { readCajerosDelivery } from './read-cajeros-delivery.mjs';
import { readFamilyCatalogue } from './read-family-catalogue.mjs';
import {
  contentFingerprint,
  departmentVoter,
  readSchoolReferences,
} from './read-official-places.mjs';
import {
  heldPlaces,
  readArguments,
  readDownload,
  report,
  writeSeed,
} from './write-official-poi-seed.mjs';

const SOURCE_URL = 'https://cajerosensantacruz.tel.bo/coordenadas/todos.php';

async function main() {
  const options = readArguments(process.argv.slice(2), [
    'pagina',
    'catalogue',
    'schools',
    'out',
    'retrieved',
  ]);
  const out = resolve(options.get('out'));
  const retrievedAt = new Date(options.get('retrieved')).toISOString().replace('.000Z', 'Z');
  const download = await readDownload(options.get('pagina'), options.get('expected-sha256'));
  const catalogue = await readFamilyCatalogue(options.get('catalogue'));
  const vote = departmentVoter(await readSchoolReferences(resolve(options.get('schools'))));
  const held = await heldPlaces(out);
  const delivery = readCajerosDelivery(download.text, catalogue, held, vote, contentFingerprint, {
    retrievedAt,
    sourceUrl: SOURCE_URL,
  });

  const { rejected } = delivery;
  process.stdout.write(`huella de la descarga:            ${download.sha256}\n`);
  report('marcadores leidos:', delivery.read);
  report('lugares ya guardados:', held.count);
  report('  ya estaban en la base:', rejected.alreadyHeld);
  report('  banco no reconocido:', rejected.withoutBank);
  report('  fuera de Bolivia:', rejected.outsideCountry);
  report('  repetido en la propia pagina:', rejected.duplicateInDelivery);
  report('  en otro departamento:', rejected.otherDepartment);
  for (const row of delivery.disagreements) {
    process.stdout.write(`    ${row.bank} ${row.sucursal ?? ''}: escuelas en ${row.voted}\n`);
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
    publishers: ['Tel.bo'],
    release: retrievedAt.slice(0, 10),
    extractionDate: retrievedAt.slice(0, 10),
    deliverySha256: download.sha256,
    // La pagina no trae informe: lo unico que dice que es y con que criterio
    // es el titulo del sitio, tomado del <title> del HTML.
    deliveryReportSha256: createHash('sha256')
      .update(download.text.match(/<title>[\s\S]*?<\/title>/u)?.[0] ?? '')
      .digest('hex'),
    deliveryUri: SOURCE_URL,
    upstreamDatasets: ['https://cajerosensantacruz.tel.bo/'],
    licences: ['directorio privado Tel.bo; redistribucion no verificada'],
    geofenceMethod: 'declared_department',
    countryCode: 'BO',
    catalogueFamilies: catalogue.size,
  };
  const pieces = await writeSeed(out, 'cajeros-poi', provenance, delivery.places);
  process.stdout.write(`\nsiembra escrita: ${pieces} piezas en ${out}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
