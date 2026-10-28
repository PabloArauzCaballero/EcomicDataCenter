/**
 * Corre las fases con UN solo Chromium, en orden: listado → fichas → Gaceta.
 * Cada fase se reanuda sola (salta lo ya guardado), así que basta con volver a
 * lanzarlo tras un corte. Si el navegador se cae, lo reabre.
 *
 * `minutos` es el plazo del turno (38 por defecto): al vencer, deja de pedir
 * páginas nuevas, cierra el navegador y sale con código 0. Se relanza para el
 * turno siguiente.
 *
 *   PW_DIR=<carpeta con playwright-core> node run-all.mjs <out> [hilos=2] [fases=list,gaceta] [minutos=38]
 */
import { openPortal, setDeadline, pastDeadline } from './seprec-browser.mjs';
import { collectList } from './collect-list.mjs';
import { collectDetails } from './collect-details.mjs';
import { collectGaceta } from './collect-gaceta.mjs';

const [out, threadsArg = '2', phasesArg = 'list,gaceta', minutesArg = '38'] = process.argv.slice(2);
if (!out) throw new Error('uso: node run-all.mjs <out> [hilos] [fases] [minutos]');
const threads = Math.min(Number(threadsArg), 2);
const phases = { list: collectList, details: collectDetails, gaceta: collectGaceta };
// La API acepta el POST de la Gaceta solo desde su propio origen (el preflight
// CORS desde miempresa.seprec.gob.bo falla): cada fase abre su portal.
const portals = { gaceta: 'https://gacetadecomercio.gob.bo/#/' };
setDeadline(Date.now() + Number(minutesArg) * 60_000);

for (const name of phasesArg.split(',')) {
  if (pastDeadline()) break;
  for (let attempt = 1; attempt <= 5 && !pastDeadline(); attempt++) {
    const { browser, page } = await openPortal(portals[name]);
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
console.log(pastDeadline() ? 'turno vencido: se sigue en la próxima corrida' : 'todas las fases terminadas');
