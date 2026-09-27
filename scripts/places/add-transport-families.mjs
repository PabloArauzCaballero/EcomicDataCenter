#!/usr/bin/env node
/**
 * Anade al catalogo unido las familias de transporte que ningun catalogo
 * definia todavia: puerto fluvial, puerto seco y zona franca.
 *
 * Usage:
 *   node scripts/places/add-transport-families.mjs \
 *     [--catalogue scripts/places/catalogue/bolivia-place-families.json]
 *
 * `build-family-catalogue.mjs` fusiona dos catalogos que llegaron completos:
 * el anexo de 201 y el de 2.330. Ninguno de los dos nombra un puerto fluvial,
 * un puerto seco o una zona franca como lo que son — infraestructura de
 * transporte, no una oficina aduanera — asi que no hay fusion posible: no
 * es que los dos discrepen, es que ninguno decide. Este script anade esas
 * tres familias donde ninguno de los dos catalogos llega, y lo hace aparte de
 * `build-family-catalogue.mjs` para no fingir que salieron de una de esas dos
 * entregas.
 *
 * Es aditivo e idempotente: una familia que ya este en el catalogo por el
 * codigo que sea, se deja como esta y se avisa en vez de sobreescribirla.
 *
 * Su historial queda en `metadata.handAdditions` y no en `metadata.additions`:
 * esa segunda clave es el bloque que escribe `build-family-catalogue.mjs`
 * cuando corre con `--additions`, con otra forma (un objeto, no una lista), y
 * las dos ramas que anadieron scripts el mismo dia eligieron el mismo nombre
 * sin saberlo. Aqui se distingue para que fusionar los dos catalogos no rompa
 * el tipo de ninguno de los dos.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_PATH = resolve(
  import.meta.dirname,
  'catalogue',
  'bolivia-place-families.json',
);

/*
 * `group` sigue el mismo vocabulario que ya usa el catalogo: TRANSPORTE para
 * infraestructura de transporte, y el mismo criterio que separa ADUANA
 * (oficina, GOBIERNO_COMERCIO_EXTERIOR) de un puerto o de un almacen. Puerto
 * seco y zona franca son recintos logisticos delimitados y no una oficina, asi
 * que quedan en LOGISTICA, junto a LOGISTICA_TRANSPORTE_CARGA.
 */
const ADDITIONS = [
  {
    code: 'PUERTO_FLUVIAL',
    group: 'TRANSPORTE',
    commercial_role: 'TRANSPORT_INFRASTRUCTURE',
    // ASP-B administra los puertos fluviales y lacustres del pais por mandato
    // legal (DS 25139 y sus modificaciones); es un puerto habilitado, no una
    // orilla cualquiera.
    is_regulated: true,
    official_validation_source: 'ASP-B / Ministerio de Obras Públicas, Servicios y Vivienda',
  },
  {
    code: 'PUERTO_SECO',
    group: 'LOGISTICA',
    commercial_role: 'TRANSPORT_INFRASTRUCTURE',
    // Un recinto aduanero de carga que opera tierra adentro necesita
    // habilitacion de la Aduana Nacional para operar como tal.
    is_regulated: true,
    official_validation_source: 'Aduana Nacional',
  },
  {
    code: 'ZONA_FRANCA',
    group: 'LOGISTICA',
    commercial_role: 'TRANSPORT_INFRASTRUCTURE',
    is_regulated: true,
    official_validation_source: 'Aduana Nacional',
  },
];

const DECIDED_BY = 'mt_transporte_2026-09-23';

async function main() {
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf('--catalogue');
  const path = flagIndex >= 0 ? resolve(args[flagIndex + 1]) : DEFAULT_PATH;

  const document = JSON.parse(await readFile(path, 'utf8'));
  const existing = new Map(document.familias.map((family) => [family.code, family]));

  let added = 0;
  let skipped = 0;
  for (const addition of ADDITIONS) {
    if (existing.has(addition.code)) {
      process.stdout.write(`  ya existe, no se toca: ${addition.code}\n`);
      skipped += 1;
      continue;
    }
    document.familias.push({ ...addition, decided_by: DECIDED_BY });
    process.stdout.write(`  anadida: ${addition.code}\n`);
    added += 1;
  }

  if (added === 0) {
    process.stdout.write('nada que anadir: las tres familias ya estaban.\n');
    return;
  }

  document.familias.sort((one, other) => one.code.localeCompare(other.code));
  document.metadata.families = document.familias.length;
  document.metadata.handAdditions = [
    ...(document.metadata.handAdditions ?? []),
    {
      addedBy: DECIDED_BY,
      addedOn: '2026-09-23',
      reason:
        'puerto fluvial, puerto seco y zona franca: ningun catalogo fusionado los define como ' +
        'infraestructura de transporte',
      codes: ADDITIONS.map((addition) => addition.code),
    },
  ];

  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  process.stdout.write(`\n${added} familias anadidas, ${skipped} ya existian.\n`);
  process.stdout.write(`catalogo unido ahora: ${document.familias.length} familias\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
