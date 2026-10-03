#!/usr/bin/env node
/**
 * Pulls every classifiable OpenStreetMap node for Bolivia, department by
 * department, and turns it into a candidate seed — never loaded here.
 *
 * This is the answer to a real question: how many more real places exist
 * beyond the 72.124 already loaded (see docs/runbooks/national-places-load.md)?
 * It does not write to `src/database/seeds/boot/`, which is the loaded,
 * immutable corpus, and it never runs `db:seed:boot`. It only produces local
 * artifacts under `artifacts/osm-national-extract/` for a human to review.
 *
 * Usage:
 *   node scripts/places/build-osm-national-extract.mjs \
 *     --catalogue scripts/places/catalogue/bolivia-place-families.json \
 *     [--out artifacts/osm-national-extract] \
 *     [--departments BO-S,BO-L]
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFamilyCatalogue } from './read-family-catalogue.mjs';
import { indexHeldPlaces, readHeldPlacesForComparison, resemblanceTo, toExpansionPlace } from './read-expansion-delivery.mjs';
import { CLASSIFYING_KEYS, classifyOsmTags } from './osm-family-mapping.mjs';
import { fetchDepartmentNodes } from './fetch-overpass.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOT_DIR = join(ROOT, 'src/database/seeds/boot');
const PLACES_PER_PIECE = 1200;

const DEPARTMENTS = [
  { iso: 'BO-B', name: 'Beni' },
  { iso: 'BO-C', name: 'Cochabamba' },
  { iso: 'BO-H', name: 'Chuquisaca' },
  { iso: 'BO-L', name: 'La Paz' },
  { iso: 'BO-N', name: 'Pando' },
  { iso: 'BO-O', name: 'Oruro' },
  { iso: 'BO-P', name: 'Potosi' },
  { iso: 'BO-S', name: 'Santa Cruz' },
  { iso: 'BO-T', name: 'Tarija' },
];

/** Same shape `UNCLASSIFIED` uses in read-expansion-delivery.mjs, for a tag no rule covers. */
const OTRA_ENTIDAD = { group: 'OTRA_ENTIDAD', commercialRole: 'OTHER', isRegulated: false, officialValidationSource: null };

function readArguments(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`unexpected argument ${argument}`);
    options.set(argument.slice(2), argv[index + 1]);
    index += 1;
  }
  if (!options.get('catalogue')) throw new Error('--catalogue is required');
  const departments = options.get('departments');
  return {
    catalogue: options.get('catalogue'),
    out: options.get('out') ?? join(ROOT, 'artifacts/osm-national-extract'),
    departments: departments ? departments.split(',') : DEPARTMENTS.map((d) => d.iso),
  };
}

function contactValues(tags, ...keys) {
  const seen = new Set();
  for (const key of keys) {
    const value = tags[key];
    if (typeof value === 'string' && value.trim().length > 0) seen.add(value.trim());
  }
  return [...seen];
}

/** Every held corpus directory, merged into one grid the whole run compares against. */
async function loadHeldGrid() {
  const directories = await readdir(BOOT_DIR, { withFileTypes: true });
  const places = [];
  for (const entry of directories) {
    if (!entry.isDirectory()) continue;
    const found = await readHeldPlacesForComparison(join(BOOT_DIR, entry.name), readdir, join);
    places.push(...found);
  }
  return { grid: indexHeldPlaces(places), total: places.length };
}

/** One raw Overpass element, turned into the `registros` shape the project's own readers expect. */
function toRegistro(element, department, generatedAt) {
  const tags = element.tags ?? {};
  const name = (tags.name ?? '').trim();
  if (name.length === 0) return null;
  const classification = classifyOsmTags(tags);
  const code = classification?.code ?? null;
  const tag = classification?.tag ?? null;
  const phones = contactValues(tags, 'phone', 'contact:phone');
  const address = tags['addr:street'] || tags['addr:housename'] ? tags : {};
  const hasContactOrAddress = phones.length > 0 || Object.keys(address).length > 0;
  return {
    fuente: 'osm',
    id: `osm:node:${element.id}`,
    nombre: name,
    municipio_fuente: tags['addr:city'] ?? tags['addr:municipality'] ?? null,
    departamento: department.name,
    latitud: element.lat,
    longitud: element.lon,
    familia_codigo: code,
    familia_generica: code === null,
    metodo_clasificacion: code ? 'osm_tag_directo' : tag ? 'tag_reconocido_sin_familia_definida' : 'sin_clasificar_no_hay_regla',
    clasificacion_tag: tag,
    metodo_posicion: 'nodo_osm_original',
    nivel_datos: hasContactOrAddress
      ? 'CONTACTO_Y_DIRECCION_PUBLICADOS'
      : code
        ? 'NOMBRE_ACTIVIDAD_Y_COORDENADAS'
        : 'NOMBRE_CATEGORIA_Y_COORDENADAS',
    direccion_fuente: tags,
    phones,
    emails: contactValues(tags, 'email', 'contact:email'),
    websites: contactValues(tags, 'website', 'contact:website'),
    socials: [],
    advertencias: [],
    source_url: `https://www.openstreetmap.org/node/${element.id}`,
    timestamp_osm_base: generatedAt,
    tags_fuente: tags,
    horario_publicado: tags.opening_hours ?? null,
    licencia_datos: 'ODbL-1.0',
  };
}

async function writePieces(directory, places) {
  await mkdir(directory, { recursive: true });
  const pieces = Math.ceil(places.length / PLACES_PER_PIECE) || 0;
  for (let piece = 0; piece < pieces; piece += 1) {
    const slice = places.slice(piece * PLACES_PER_PIECE, (piece + 1) * PLACES_PER_PIECE);
    await writeFile(join(directory, `osm-extract-${String(piece).padStart(3, '0')}.json`), `${JSON.stringify({ places: slice })}\n`, 'utf8');
  }
  return pieces;
}

/**
 * One key at a time, not the whole department in one request.
 *
 * The first pilot run asked for all seven classifying keys together and
 * Overpass answered with a 504 for a department far smaller than Santa
 * Cruz or La Paz — the dispatcher's own timeout, not this project's. A
 * per-key request is a fraction of the payload and, just as important,
 * one key failing does not lose the six that already answered.
 */
async function fetchDepartmentElements(iso) {
  const byId = new Map();
  let generatedAt = null;
  const failedKeys = [];
  for (const key of CLASSIFYING_KEYS) {
    try {
      const result = await fetchDepartmentNodes(iso, [key], { timeoutSeconds: 60 });
      generatedAt = generatedAt ?? result.generatedAt;
      for (const element of result.elements) byId.set(element.id, element);
    } catch (error) {
      failedKeys.push(key);
      process.stderr.write(`  ${iso}/${key}: se salta (${error.message})\n`);
    }
  }
  return { elements: [...byId.values()], generatedAt, failedKeys };
}

async function processDepartment(department, catalogue, grid, outDir) {
  const { elements, generatedAt, failedKeys } = await fetchDepartmentElements(department.iso);
  await mkdir(join(outDir, 'raw'), { recursive: true });
  await writeFile(join(outDir, 'raw', `${department.iso}.json`), JSON.stringify({ elements, generatedAt, failedKeys }), 'utf8');

  const counts = { raw: elements.length, withoutName: 0, classified: 0, otraEntidad: 0, resembling: 0, failedKeys };
  const places = [];
  for (const element of elements) {
    const registro = toRegistro(element, department, generatedAt);
    if (!registro) {
      counts.withoutName += 1;
      continue;
    }
    const family = registro.familia_codigo ? catalogue.get(registro.familia_codigo) : OTRA_ENTIDAD;
    if (!family) throw new Error(`${registro.familia_codigo} no existe en el catalogo cargado`);
    if (family === OTRA_ENTIDAD) counts.otraEntidad += 1;
    else counts.classified += 1;
    const resemblance = resemblanceTo(grid, registro);
    if (resemblance) counts.resembling += 1;
    places.push({ place: toExpansionPlace(registro, family, resemblance), group: family.group });
  }
  return { counts, places };
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  const catalogue = await readFamilyCatalogue(options.catalogue);
  const { grid, total: heldTotal } = await loadHeldGrid();
  process.stdout.write(`corpus ya cargado: ${heldTotal} lugares\n`);

  const byGroup = new Map();
  const allPlaces = [];
  const perDepartment = [];
  for (const iso of options.departments) {
    const department = DEPARTMENTS.find((d) => d.iso === iso);
    if (!department) throw new Error(`departamento desconocido: ${iso}`);
    process.stdout.write(`\n${department.name} (${department.iso})...\n`);
    try {
      const { counts, places } = await processDepartment(department, catalogue, grid, options.out);
      perDepartment.push({ department: department.name, ...counts });
      process.stdout.write(
        `  crudos ${counts.raw} · sin nombre ${counts.withoutName} · clasificados ${counts.classified} · otra_entidad ${counts.otraEntidad} · parecidos a uno ya guardado ${counts.resembling}\n`,
      );
      for (const { place, group } of places) {
        if (!place.resemblesHeldPlace) {
          byGroup.set(group, (byGroup.get(group) ?? 0) + 1);
          allPlaces.push(place);
        }
      }
    } catch (error) {
      perDepartment.push({ department: department.name, error: error.message });
      process.stderr.write(`  BLOQUEADO: ${error.message}\n`);
    }
  }

  const pieces = await writePieces(join(options.out, 'seed'), allPlaces);
  const report = {
    generatedAt: new Date().toISOString(),
    heldCorpusTotal: heldTotal,
    perDepartment,
    netNewPlaces: allPlaces.length,
    byGroup: Object.fromEntries([...byGroup.entries()].sort((a, b) => b[1] - a[1])),
  };
  await writeFile(join(options.out, 'reporte.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`\nsiembra candidata: ${pieces} piezas, ${allPlaces.length} lugares nuevos netos, en ${options.out}/seed\n`);
  process.stdout.write(`reporte: ${options.out}/reporte.json\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
