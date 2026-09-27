#!/usr/bin/env node
/**
 * Builds a seed from the SIE list of educational units.
 *
 * Usage:
 *   node scripts/places/build-sie-poi-seed.mjs \
 *     --lista <export .xls saved from the SIE> \
 *     --catalogue scripts/places/catalogue/bolivia-place-families.json \
 *     --out src/database/seeds/boot/bolivia-sie-poi \
 *     --retrieved <ISO time of the download> \
 *     [--expected-sha256 <fingerprint the runbook names>] [--limit-km 25]
 *
 * The export is what the SIE serves to anybody who presses «Excel» on the
 * report of educational units, and the runbook says how to ask for it. What
 * is kept and what is dropped is decided in `read-sie-delivery.mjs`; every
 * drop is counted and printed here.
 */

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { readFamilyCatalogue } from './read-family-catalogue.mjs';
import { readSieDelivery } from './read-sie-delivery.mjs';
import {
  heldPlaces,
  readArguments,
  readDownload,
  report,
  writeSeed,
} from './write-official-poi-seed.mjs';

const SOURCE_URL =
  'https://reportes.sie.gob.bo/reporteestadistico/informacion/general/regular/unidad/educativa/lista/print/xls';

async function main() {
  const options = readArguments(process.argv.slice(2), ['lista', 'catalogue', 'out', 'retrieved']);
  const out = resolve(options.get('out'));
  const retrievedAt = new Date(options.get('retrieved')).toISOString().replace('.000Z', 'Z');
  const download = await readDownload(options.get('lista'), options.get('expected-sha256'));
  const catalogue = await readFamilyCatalogue(options.get('catalogue'));
  const held = await heldPlaces(out);
  const delivery = readSieDelivery(download.text, catalogue, held, {
    limitKm: Number(options.get('limit-km') ?? 25),
    retrievedAt,
    sourceUrl: SOURCE_URL,
  });

  const { rejected } = delivery;
  process.stdout.write(`huella de la descarga:            ${download.sha256}\n`);
  report('unidades leidas:', delivery.read);
  report('lugares ya guardados:', held.count);
  report('  ya estaban en la base:', rejected.alreadyHeld);
  report('  sin R.U.E. o sin nombre:', rejected.withoutCode);
  report('  sin coordenada o fuera de Bolivia:', rejected.outsideCountry);
  report('  lejos de su municipio:', rejected.farFromMunicipality);
  report('  subsistema sin familia:', rejected.unknownSubsystem);
  report('se escriben:', delivery.places.length);
  report('  parecidos a uno guardado:', delivery.resembling);
  const byFamily = new Map();
  for (const place of delivery.places) {
    byFamily.set(place.entityFamily, (byFamily.get(place.entityFamily) ?? 0) + 1);
  }
  for (const [family, count] of byFamily) report(`  ${family}:`, count);

  if (delivery.places.length === 0) {
    process.stdout.write('\nNo hay nada que escribir.\n');
    process.exitCode = 1;
    return;
  }
  const provenance = {
    publishers: ['Ministerio de Educacion (SIE)'],
    release: retrievedAt.slice(0, 10),
    extractionDate: retrievedAt.slice(0, 10),
    deliverySha256: download.sha256,
    // El informe de esta entrega es lo que el ministerio escribe alrededor de
    // la tabla: el titulo, el criterio «abiertas legalmente establecidas» y las
    // notas sobre cada dependencia.
    deliveryReportSha256: createHash('sha256')
      .update(JSON.stringify(delivery.heading))
      .digest('hex'),
    deliveryUri: `${SOURCE_URL}#POST:codigo=0&rol=0&gestion=${retrievedAt.slice(0, 4)}`,
    upstreamDatasets: ['https://reportes.sie.gob.bo/reporteestadistico/'],
    licences: ['reporte publico del SIE; redistribucion no verificada'],
    geofenceMethod: 'declared_municipality',
    countryCode: 'BO',
    catalogueFamilies: catalogue.size,
  };
  const pieces = await writeSeed(out, 'sie-poi', provenance, delivery.places);
  process.stdout.write(`\nsiembra escrita: ${pieces} piezas en ${out}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
