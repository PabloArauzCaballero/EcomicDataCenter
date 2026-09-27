#!/usr/bin/env node
/**
 * Descarga de OpenStreetMap los lugares de transporte de Bolivia.
 *
 * Uso:
 *   node scripts/places/download-transport-osm.mjs --out <directorio de datos crudos> \
 *     [--endpoint https://maps.mail.ru/osm/tools/overpass/api/interpreter]
 *
 * Una consulta por clase de lugar y no una sola: la de todo el pais junta
 * agotaba el tiempo del servidor, y el principal (`overpass-api.de`) corta a
 * quien encadena consultas. Entre una y otra se espera, y si una falla se
 * reintenta con espera creciente en vez de martillar.
 *
 * Cada respuesta se guarda cruda, con la fecha en el nombre, y el script
 * imprime su huella: el constructor de la siembra la comprueba antes de leer
 * nada. Los datos son © OpenStreetMap contributors, bajo ODbL-1.0.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Cada clase de lugar con los filtros de etiquetas que la definen en OpenStreetMap. */
export const TRANSPORT_QUERIES = [
  ['aerodromos', ['nwr["aeroway"="aerodrome"]', 'nwr["aeroway"="airstrip"]']],
  ['terminales-aereas', ['nwr["aeroway"="terminal"]']],
  ['helipuertos', ['nwr["aeroway"="heliport"]']],
  ['terminales-buses', ['nwr["amenity"="bus_station"]']],
  [
    'paradas-bus',
    [
      'node["highway"="bus_stop"]',
      'nwr["public_transport"="platform"]["bus"="yes"]',
      'nwr["public_transport"="platform"]["highway"="bus_stop"]',
    ],
  ],
  ['estaciones-transporte-publico', ['nwr["public_transport"="station"]']],
  ['ferrocarril', ['nwr["railway"="station"]', 'nwr["railway"="halt"]']],
  [
    'puertos',
    [
      'nwr["harbour"="yes"]',
      'nwr["amenity"="ferry_terminal"]',
      'nwr["man_made"="pier"]',
      'nwr["industrial"="port"]',
      'nwr["landuse"="port"]',
      'nwr["harbour:category"]',
    ],
  ],
  ['teleferico', ['nwr["aerialway"="station"]']],
  [
    'zonas-francas-y-puertos-secos',
    ['nwr["name"~"zona franca|puerto seco|recinto aduanero",i]', 'nwr["industrial"="free_zone"]'],
  ],
];

function readArguments(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith('--')) throw new Error(`unexpected argument ${argv[index]}`);
    options.set(argv[index].slice(2), argv[index + 1]);
  }
  if (!options.get('out')) throw new Error('--out is required');
  return {
    out: resolve(options.get('out')),
    endpoint: options.get('endpoint') ?? 'https://overpass-api.de/api/interpreter',
    only: options.get('only') ?? null,
  };
}

const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

/*
 * El rectangulo y no el area administrativa: la busqueda por area obliga a
 * Overpass a resolver primero el poligono de Bolivia contra su base de areas,
 * y esa resolucion es lo que expiraba en el servidor principal. El rectangulo
 * es el mismo que usa el esquema del corpus para aceptar una coordenada
 * (`bolivia-national-poi.schema.ts`), asi que un elemento que quede fuera de
 * Bolivia por venir de un pais vecino dentro del rectangulo lo filtra el
 * lector, no esta consulta.
 */
const BOLIVIA_BBOX = '-23,-70,-9,-57';

function queryText(filters) {
  const union = filters.map((filter) => `${filter}(${BOLIVIA_BBOX});`).join('');
  return `[out:json][timeout:170];(${union});out center tags meta;`;
}

async function fetchWithRetries(endpoint, query) {
  let wait = 15000;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'ObservatorioEconomicoBolivia/1.0 (carga de lugares de transporte)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(200000),
      });
      const text = await response.text();
      // Overpass responde 200 con un `remark` cuando la consulta murio a medias.
      if (response.ok && text.startsWith('{') && !/"remark":\s*"runtime error/u.test(text)) {
        return text;
      }
      process.stderr.write(`  intento ${attempt}: http ${response.status}\n`);
    } catch (error) {
      process.stderr.write(`  intento ${attempt}: ${error.message}\n`);
    }
    await pause(wait);
    wait *= 2;
  }
  throw new Error('Overpass no respondio tras cinco intentos');
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  await mkdir(options.out, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const manifest = { endpoint: options.endpoint, fecha: day, licencia: 'ODbL-1.0', archivos: [] };
  const failed = [];
  for (const [name, filters] of TRANSPORT_QUERIES) {
    if (options.only && options.only !== name) continue;
    process.stdout.write(`${name}...\n`);
    /*
     * Una clase que agota los cinco intentos no debe tirar las que faltan: el
     * servidor principal limita por rachas, y una clase pesada (paradas de
     * bus, con miles de nodos) puede fallar hoy y responder manana sin que
     * las demas clases tengan nada que ver.
     */
    let text;
    try {
      text = await fetchWithRetries(options.endpoint, queryText(filters));
    } catch (error) {
      process.stderr.write(`  se deja para otro intento: ${error.message}\n`);
      failed.push(name);
      await pause(20000);
      continue;
    }
    const file = `osm-${name}-${day}.json`;
    await writeFile(join(options.out, file), text, 'utf8');
    const sha256 = createHash('sha256').update(text).digest('hex');
    const elements = JSON.parse(text).elements.length;
    manifest.archivos.push({ clase: name, archivo: file, sha256, elementos: elements });
    process.stdout.write(`  ${elements} elementos, sha256 ${sha256}\n`);
    await pause(20000);
  }
  if (failed.length > 0) {
    process.stderr.write(`\nclases sin descargar: ${failed.join(', ')}\n`);
  }
  if (!options.only) {
    await writeFile(
      join(options.out, `osm-transporte-manifiesto-${day}.json`),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
