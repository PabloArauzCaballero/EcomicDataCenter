#!/usr/bin/env node
/**
 * Descarga de OpenStreetMap, departamento por departamento, los lugares de los
 * rubros que el corpus casi no tiene: agro, industria, mineria, oficinas
 * financieras, telecomunicaciones, gobierno, turismo, cultura, religion,
 * deporte y mercados.
 *
 * Uso:
 *   node scripts/places/fetch-osm-expansion.mjs --out-dir <carpeta de crudos>
 *     [--endpoint <interprete Overpass>] [--only BO-S,BO-L]
 *
 * Escribe un JSON crudo por departamento, tal como Overpass lo devuelve, y un
 * `manifiesto.json` con la huella de cada uno, el interprete que respondio, la
 * consulta exacta y la hora del snapshot que el propio Overpass declara. La
 * siembra se construye despues desde esos crudos y nunca desde la red: asi la
 * lectura se puede repetir byte a byte, y lo que la red devuelva manana no
 * cambia lo que ya se construyo.
 *
 * Se consulta por departamento y no por pais porque el area administrativa es
 * lo unico que situa un lugar en un departamento aqui. Es pertenencia a un area
 * de OpenStreetMap, no frontera oficial —la misma reserva que la ampliacion de
 * Cochabamba y La Paz escribe como `no_limite_certificado`— y la procedencia lo
 * dice con `geofenceMethod: osm_administrative_area`.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DEPARTMENT_AREAS, overpassQuery } from './osm-expansion-query.mjs';

/*
 * El espejo de mail.ru va al dia; los otros dos que respondieron el
 * 2026-09-23 servian un snapshot de mayo. Se prueba en orden y se anota cual
 * contesto, porque dos espejos pueden devolver dos mapas distintos.
 */
const ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
/*
 * Los interpretes publicos son compartidos y cortan a quien pregunta seguido.
 * Una pausa entre departamentos cuesta minutos y evita que la descarga entera
 * dependa de no haber molestado a nadie.
 */
const PAUSE_MS = 30_000;

function readArguments(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith('--')) throw new Error(`argumento inesperado ${argv[index]}`);
    options.set(argv[index].slice(2), argv[index + 1]);
  }
  if (!options.get('out-dir')) throw new Error('--out-dir es obligatorio');
  return {
    outDir: resolve(options.get('out-dir')),
    endpoints: options.get('endpoint') ? [options.get('endpoint')] : ENDPOINTS,
    only: options.get('only') ? new Set(options.get('only').split(',')) : null,
  };
}

async function ask(endpoint, query) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'ObservatorioEconomicoBolivia/1.0 (carga de lugares)',
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(900_000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`${endpoint} respondio ${response.status}`);
  // Overpass contesta 200 con un `remark` cuando se le acaba el tiempo: eso es
  // una respuesta incompleta, y guardarla como si fuera el mapa seria mentir.
  const parsed = JSON.parse(bytes.toString('utf8'));
  if (parsed.remark && /error|timed out|runtime/iu.test(parsed.remark)) {
    throw new Error(`${endpoint}: ${parsed.remark}`);
  }
  return { bytes, parsed };
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  await mkdir(options.outDir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const files = [];

  let first = true;
  for (const area of DEPARTMENT_AREAS) {
    if (options.only && !options.only.has(area.iso)) continue;
    const name = `osm-${area.iso}-${day}.json`;
    const sidecar = join(options.outDir, `${name}.meta`);
    /*
     * Se reanuda: un departamento ya descargado hoy no se vuelve a pedir. Los
     * interpretes publicos cortan a mitad de camino —La Paz devolvio 504 el
     * 2026-09-23— y repetir los que ya llegaron solo alarga el corte siguiente.
     */
    let answered = null;
    try {
      const bytes = await readFile(join(options.outDir, name));
      const meta = JSON.parse(await readFile(sidecar, 'utf8'));
      answered = { endpoint: meta.interprete, bytes, parsed: JSON.parse(bytes.toString('utf8')) };
      process.stdout.write(`${area.iso} ya estaba descargado
`);
    } catch {
      answered = null;
    }
    const query = overpassQuery(area.areaId);
    for (let attempt = 0; attempt < 3 && !answered; attempt += 1) {
      for (const endpoint of options.endpoints) {
        if (!first) await new Promise((done) => setTimeout(done, PAUSE_MS * (attempt + 1)));
        first = false;
        try {
          answered = { endpoint, ...(await ask(endpoint, query)) };
          break;
        } catch (error) {
          process.stderr.write(`${area.iso}: ${error.message}
`);
        }
      }
    }
    if (!answered) throw new Error(`ningun interprete respondio para ${area.iso}`);
    await writeFile(join(options.outDir, name), answered.bytes);
    await writeFile(sidecar, JSON.stringify({ interprete: answered.endpoint }), 'utf8');
    const sha256 = createHash('sha256').update(answered.bytes).digest('hex');
    files.push({
      archivo: name,
      departamento: area.name,
      iso: area.iso,
      areaId: area.areaId,
      sha256,
      elementos: answered.parsed.elements.length,
      interprete: answered.endpoint,
      snapshotOsm: answered.parsed.osm3s?.timestamp_osm_base ?? null,
      snapshotAreas: answered.parsed.osm3s?.timestamp_areas_base ?? null,
      consulta: query,
    });
    process.stdout.write(`${area.iso} ${answered.parsed.elements.length} elementos ${sha256}
`);
  }

  await writeFile(
    join(options.outDir, 'manifiesto.json'),
    `${JSON.stringify(
      {
        fuente: 'OpenStreetMap via Overpass API',
        licencia: 'ODbL-1.0',
        atribucion: '© OpenStreetMap contributors, ODbL',
        descargado: new Date().toISOString(),
        archivos: files,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
