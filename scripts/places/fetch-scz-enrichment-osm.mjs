#!/usr/bin/env node
/**
 * Descarga de OpenStreetMap, por grupo de rubro, el comercio y los servicios
 * de Santa Cruz de la Sierra que la entrega nacional de Overture clasificó
 * como `OTRA_ENTIDAD` u `OV_SERVICES_AND_BUSINESS` — o no trajo.
 *
 * Uso:
 *   node scripts/places/fetch-scz-enrichment-osm.mjs --out-dir <carpeta de crudos>
 *     [--endpoint <intérprete Overpass>] [--only comercio-minorista,gastronomia]
 *
 * Mismo patrón que `fetch-osm-expansion.mjs`: un JSON crudo por grupo, un
 * `manifiesto.json` con la huella, el intérprete que respondió y la hora del
 * snapshot, y se reanuda — un grupo ya descargado hoy no se vuelve a pedir.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { QUERY_GROUPS, overpassQuery } from './scz-enrichment-query.mjs';

/*
 * El mismo orden de espejos que documentó la ampliación por rubros el
 * 2026-09-23: mail.ru servía el snapshot más fresco ese día.
 */
const ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
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
      'user-agent': 'ObservatorioEconomicoBolivia/1.0 (carga de lugares de Santa Cruz)',
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(700_000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`${endpoint} respondio ${response.status}`);
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
  for (const [group, filters] of QUERY_GROUPS) {
    if (options.only && !options.only.has(group)) continue;
    const name = `osm-scz-${group}-${day}.json`;
    const sidecar = join(options.outDir, `${name}.meta`);

    let answered = null;
    try {
      const bytes = await readFile(join(options.outDir, name));
      const meta = JSON.parse(await readFile(sidecar, 'utf8'));
      answered = { endpoint: meta.interprete, bytes, parsed: JSON.parse(bytes.toString('utf8')) };
      process.stdout.write(`${group} ya estaba descargado\n`);
    } catch {
      answered = null;
    }
    const query = overpassQuery(filters);
    for (let attempt = 0; attempt < 3 && !answered; attempt += 1) {
      for (const endpoint of options.endpoints) {
        if (!first) await new Promise((done) => setTimeout(done, PAUSE_MS * (attempt + 1)));
        first = false;
        try {
          answered = { endpoint, ...(await ask(endpoint, query)) };
          break;
        } catch (error) {
          process.stderr.write(`${group}: ${error.message}\n`);
        }
      }
    }
    if (!answered) throw new Error(`ningun interprete respondio para ${group}`);
    await writeFile(join(options.outDir, name), answered.bytes);
    await writeFile(sidecar, JSON.stringify({ interprete: answered.endpoint }), 'utf8');
    const sha256 = createHash('sha256').update(answered.bytes).digest('hex');
    files.push({
      archivo: name,
      grupo: group,
      sha256,
      elementos: answered.parsed.elements.length,
      interprete: answered.endpoint,
      snapshotOsm: answered.parsed.osm3s?.timestamp_osm_base ?? null,
      snapshotAreas: answered.parsed.osm3s?.timestamp_areas_base ?? null,
      consulta: query,
    });
    process.stdout.write(`${group} ${answered.parsed.elements.length} elementos ${sha256}\n`);
  }

  await writeFile(
    join(options.outDir, 'manifiesto.json'),
    `${JSON.stringify(
      {
        fuente: 'OpenStreetMap via Overpass API',
        area: 'Municipio Santa Cruz de la Sierra (relación OSM 4511527)',
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
