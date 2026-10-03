#!/usr/bin/env node
/**
 * Lee el CSV de 15.749 escuelas del Ministerio de Educación (gestión 2016) y
 * produce la entrega intermedia en la forma `{ registros: [...] }` que ya
 * consumen los demás lectores de scripts/places — mismos campos que la
 * ampliación de las otras capitales define en read-expansion-delivery.mjs.
 *
 * Usage:
 *   node scripts/places/build-educacion-delivery.mjs \
 *     --csv       artifacts/registros-sectoriales-investigacion/ministerio-educacion-establecimientos-2016.csv \
 *     --catalogue scripts/places/catalogue/bolivia-place-families.json \
 *     --out       artifacts/registros-sectoriales-investigacion/educacion-delivery.json \
 *     [--boot     src/database/seeds/boot]
 *
 * Clasificación: el CSV no trae columna de nivel, ciclo ni tipo de unidad
 * (sus nueve columnas son departamento, distrito, zona, direccion, latitud,
 * longitud, codigo_ue, unidad_educativa, cod_edif_educativo). El catálogo
 * define tres códigos que podrían aplicar a una unidad educativa —
 * COLEGIO_ESCUELA, PREESCOLAR, GUARDERIA— y nada en la fila dice cuál de los
 * tres es. Por eso las 15.749 filas se clasifican con el código genérico ya
 * existente en el catálogo, COLEGIO_ESCUELA (grupo EDUCACION,
 * `is_regulated: true`, `Ministerio de Educación / SEIE`), en vez de
 * inventar una distinción que el dato no sostiene.
 *
 * `municipio_fuente` se llena con la columna `distrito`, que es el distrito
 * educativo del Ministerio y no siempre coincide 1 a 1 con el municipio: en
 * las ciudades grandes un municipio se reparte en varios distritos («LA PAZ
 * 2», «EL ALTO 2»). Es el campo territorial más cercano que el CSV trae; no
 * hay columna de municipio aparte.
 *
 * Deduplicación: cada fila se compara contra el corpus que el repositorio ya
 * guarda en src/database/seeds/boot (todo directorio `*-poi`, leído y nunca
 * escrito) con indexHeldPlaces/resemblanceTo de read-expansion-delivery.mjs.
 * Una fila que se parece a un lugar ya guardado —cerca y con nombre
 * parecido— no es una alta nueva y no entra en la entrega escrita.
 *
 * No escribe en src/database/seeds/boot, no ejecuta ningún seed, no hace
 * commit ni push y no toca base de datos alguna: solo produce este artefacto
 * y el resumen que imprime por stdout.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  indexHeldPlaces,
  readHeldPlacesForComparison,
  resemblanceTo,
} from './read-expansion-delivery.mjs';
import { readFamilyCatalogue } from './read-family-catalogue.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAMILY_CODE = 'COLEGIO_ESCUELA';

function readArguments(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith('--')) throw new Error(`unexpected argument ${argv[index]}`);
    options.set(argv[index].slice(2), argv[index + 1]);
  }
  for (const required of ['csv', 'catalogue', 'out']) {
    if (!options.get(required)) throw new Error(`--${required} is required`);
  }
  return {
    csv: resolve(options.get('csv')),
    catalogue: resolve(options.get('catalogue')),
    out: resolve(options.get('out')),
    boot: resolve(options.get('boot') ?? join(ROOT, 'src/database/seeds/boot')),
  };
}

function stripByteOrderMark(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Una línea del CSV del ministerio: separada por `;`, con comillas al estilo RFC 4180. */
function parseSemicolonLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted && character === '"' && line[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ';' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

/** El ministerio escribe los decimales con coma: `-16,504568` y no `-16.504568`. */
function parseDecimalComma(value) {
  const text = (value ?? '').trim();
  if (text.length === 0) return NaN;
  return Number.parseFloat(text.replace(',', '.'));
}

async function readSchoolsCsv(path) {
  const text = stripByteOrderMark(await readFile(path, 'utf8'));
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = parseSemicolonLine(lines[0]).map((name) => name.trim());
  const column = (name) => header.indexOf(name);
  const at = {
    departamento: column('departamento'),
    distrito: column('distrito'),
    zona: column('zona'),
    direccion: column('direccion'),
    latitud: column('latitud'),
    longitud: column('longitud'),
    codigo: column('codigo_ue'),
    nombre: column('unidad_educativa'),
  };
  for (const [name, index] of Object.entries(at)) {
    if (index < 0) throw new Error(`el CSV no trae la columna ${name}`);
  }

  const rows = [];
  for (const line of lines.slice(1)) {
    const fields = parseSemicolonLine(line);
    rows.push({
      departamento: (fields[at.departamento] ?? '').trim(),
      distrito: (fields[at.distrito] ?? '').trim(),
      zona: (fields[at.zona] ?? '').trim(),
      direccion: (fields[at.direccion] ?? '').trim(),
      latitud: parseDecimalComma(fields[at.latitud]),
      longitud: parseDecimalComma(fields[at.longitud]),
      codigo: (fields[at.codigo] ?? '').trim(),
      nombre: (fields[at.nombre] ?? '').trim(),
    });
  }
  return rows;
}

/** Los directorios de siembra que el repositorio ya guarda, para leerlos y no escribirlos. */
async function heldSeedDirectories(boot) {
  const entries = await readdir(boot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('-poi'))
    .map((entry) => join(boot, entry.name));
}

async function main() {
  const options = readArguments(process.argv.slice(2));

  const catalogue = await readFamilyCatalogue(options.catalogue);
  if (!catalogue.has(FAMILY_CODE)) {
    throw new Error(`el catálogo no define ${FAMILY_CODE}`);
  }

  const rows = await readSchoolsCsv(options.csv);

  const held = [];
  for (const directory of await heldSeedDirectories(options.boot)) {
    held.push(...(await readHeldPlacesForComparison(directory, readdir, join)));
  }
  const grid = indexHeldPlaces(held);

  const rejected = { sinNombre: 0, sinCodigo: 0, offPlanet: 0, outsideCountry: 0 };
  const seenCodes = new Set();
  let duplicatedInSource = 0;
  let resembling = 0;
  const registros = [];

  for (const row of rows) {
    if (row.nombre.length === 0) {
      rejected.sinNombre += 1;
      continue;
    }
    if (row.codigo.length === 0) {
      rejected.sinCodigo += 1;
      continue;
    }
    if (seenCodes.has(row.codigo)) {
      duplicatedInSource += 1;
      continue;
    }
    seenCodes.add(row.codigo);

    const { latitud, longitud } = row;
    if (
      Number.isNaN(latitud) ||
      Number.isNaN(longitud) ||
      !(latitud >= -90 && latitud <= 90 && longitud >= -180 && longitud <= 180)
    ) {
      rejected.offPlanet += 1;
      continue;
    }
    if (!(latitud >= -23 && latitud <= -9 && longitud >= -70 && longitud <= -57)) {
      rejected.outsideCountry += 1;
      continue;
    }

    const resemblance = resemblanceTo(grid, { nombre: row.nombre, latitud, longitud });
    if (resemblance) {
      resembling += 1;
      continue; // Se parece a un lugar que el corpus ya guarda: no es una alta.
    }

    registros.push({
      id: `minedu:${row.codigo}`,
      nombre: row.nombre,
      municipio_fuente: row.distrito.length > 0 ? row.distrito : null,
      departamento: row.departamento,
      latitud,
      longitud,
      familia_codigo: FAMILY_CODE,
      familia_generica: false,
      metodo_clasificacion: 'codigo_generico_educacion_csv_minedu_sin_columna_de_nivel_o_tipo',
      fuente: 'minedu',
      direccion_fuente:
        row.direccion.length > 0 ? row.direccion : row.zona.length > 0 ? row.zona : null,
      licencia_datos: 'CC-BY-SA',
    });
  }

  process.stdout.write(`filas leidas:                 ${rows.length}\n`);
  process.stdout.write(`  sin nombre:                 ${rejected.sinNombre}\n`);
  process.stdout.write(`  sin codigo_ue:               ${rejected.sinCodigo}\n`);
  process.stdout.write(`  codigo_ue repetido en el CSV:${String(duplicatedInSource).padStart(6)}\n`);
  process.stdout.write(`  coordenada imposible:        ${rejected.offPlanet}\n`);
  process.stdout.write(`  fuera de Bolivia:            ${rejected.outsideCountry}\n`);
  process.stdout.write(`  parecidas a un lugar guardado:${String(resembling).padStart(5)}\n`);
  process.stdout.write(`se escriben (altas nuevas):    ${registros.length}\n`);

  await writeFile(options.out, `${JSON.stringify({ registros }, null, 2)}\n`, 'utf8');
  process.stdout.write(`\nescrito en ${options.out}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
