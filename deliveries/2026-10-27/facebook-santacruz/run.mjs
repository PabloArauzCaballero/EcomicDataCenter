/**
 * Orquestador: alterna tandas de descubrimiento (Yahoo) y de lectura (Facebook) en
 * serie, de modo que nunca hay más de un Chromium abierto. La laptop es compartida
 * con otros agentes: antes de cada tanda exige 800 MB libres.
 *
 * Uso: node run.mjs [horas=8] [consultasPorTanda=10] [paginasPorTanda=30]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const hours = Number(process.argv[2] ?? 8);
const perDiscover = Number(process.argv[3] ?? 10);
const perFetch = Number(process.argv[4] ?? 30);
const deadline = Date.now() + hours * 3600_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function memOk() {
  while (os.freemem() < 800 * 1024 * 1024) {
    console.log(`[run] libre ${Math.round(os.freemem() / 1048576)} MB: espero 60 s`);
    await sleep(60_000);
  }
}
const lines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length : 0);

let round = 0;
while (Date.now() < deadline) {
  round += 1;
  const discoverDone = fs.existsSync(path.join(HERE, 'work', 'discover.done'));
  const pending = lines(path.join(HERE, 'work', 'candidates.ndjson')) - lines(path.join(HERE, 'work', 'results.ndjson'));
  console.log(`[run] ronda ${round} ${new Date().toISOString()} pendientes≈${pending} libre=${Math.round(os.freemem() / 1048576)}MB`);
  // Si ya hay muchos candidatos sin leer, la tanda de búsqueda se acorta.
  if (!discoverDone) {
    await memOk();
    spawnSync(process.execPath, [path.join(HERE, 'discover.mjs'), String(pending > 600 ? Math.ceil(perDiscover / 3) : perDiscover)], { stdio: 'inherit', cwd: HERE });
  }
  await memOk();
  const r = spawnSync(process.execPath, [path.join(HERE, 'fetch.mjs'), '1', '--once'], { stdio: 'inherit', cwd: HERE, env: { ...process.env, FB_LIMIT: String(perFetch) } });
  if (discoverDone && pending <= 0) break;
  if (r.status !== 0) await sleep(30_000);
}
console.log('[run] fin');
