import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bankVirtualAssetsSchema } from '../../src/database/seeds/schemas/bank-virtual-assets.schema';
import { PAGES } from './bank-sources';
import { laPazDate, mergeSeed, readPage, type Reading } from './bank-readings';

/**
 * Lee la página oficial de cada banco que ofrece dólar digital y suma el
 * punto del día a su serie.
 *
 * Fusiona con la semilla que encuentra y solo agrega: ningún día se borra. Una
 * página que no responde, o que responde otra cosa que la del banco, no
 * escribe nada: no saber no es haber visto que el servicio se retiró.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'bank-virtual-assets.json');
const USER_AGENT = 'Mozilla/5.0 (compatible; ObservatorioEconomico/1.0; datosbolivia.com)';

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, 'accept-language': 'es' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main(): Promise<void> {
  const now = new Date();
  const today = laPazDate(now);
  const readings: Reading[] = [];
  for (const page of PAGES) {
    try {
      const one = readPage(page, await download(page.url), today, now);
      readings.push(...one);
      const offered = one[0]?.point.value === '1' ? 'ofrece' : 'YA NO LO NOMBRA';
      console.log(`${page.bank}: ${offered}, ${one.length - 1} límites leídos`);
    } catch (error) {
      console.warn(`${page.bank}: sin lectura hoy (${(error as Error).message})`);
    }
  }
  if (readings.length === 0) {
    throw new Error('ninguna página de banco respondió: no se escribe una semilla vacía');
  }
  const previous = existsSync(SEED)
    ? bankVirtualAssetsSchema.parse(JSON.parse(readFileSync(SEED, 'utf8'))).series
    : [];
  // Se escribe lo que el esquema devuelve y no lo que se armó: el esquema fija el
  // orden de las claves, y sin eso la semilla cambia de forma entre una corrida y
  // la siguiente sin que cambie ninguna cifra, y cada cambio es un despliegue.
  const { series } = bankVirtualAssetsSchema.parse({ series: mergeSeed(previous, readings) });
  writeFileSync(SEED, `${JSON.stringify({ series }, null, 2)}\n`);
  console.log(`semilla escrita: ${series.length} series, ${readings.length} lecturas de ${today}`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'bank collection failed'}\n`);
  process.exitCode = 1;
});
