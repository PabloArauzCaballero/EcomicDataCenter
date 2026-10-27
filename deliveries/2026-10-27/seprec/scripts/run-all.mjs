/**
 * Corre las tres fases con UN solo Chromium, en orden: listado → fichas →
 * Gaceta. Cada fase se reanuda sola (salta lo ya guardado), así que basta con
 * volver a lanzarlo tras un corte. Si el navegador se cae, lo reabre.
 *
 *   PW_DIR=<carpeta con playwright-core> node run-all.mjs <out> [hilos=2] [fases=list,details,gaceta]
 */
import { openPortal } from './seprec-browser.mjs';
import { collectList } from './collect-list.mjs';
import { collectDetails } from './collect-details.mjs';
import { collectGaceta } from './collect-gaceta.mjs';

const [out, threadsArg = '2', phasesArg = 'list,details,gaceta'] = process.argv.slice(2);
if (!out) throw new Error('uso: node run-all.mjs <out> [hilos] [fases]');
const threads = Math.min(Number(threadsArg), 2);
const phases = { list: collectList, details: collectDetails, gaceta: collectGaceta };

for (const name of phasesArg.split(',')) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { browser, page } = await openPortal();
    try {
      await phases[name](page, out, threads);
      break;
    } catch (e) {
      console.error(`[${name}] intento ${attempt} falló: ${e.message}`);
      if (attempt === 5) throw e;
    } finally {
      await browser.close().catch(() => {});
    }
  }
}
console.log('todas las fases terminadas');
