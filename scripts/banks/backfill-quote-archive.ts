import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bankVirtualAssetsSchema } from '../../src/database/seeds/schemas/bank-virtual-assets.schema';
import { QUOTE_FEEDS } from './bank-sources';
import { laPazDate, mergeSeed, readQuoteFeed, type Reading } from './bank-readings';

/**
 * Rellena la historia de la cotización de un banco con las copias de su
 * portada que guardó el Internet Archive.
 *
 * La cinta del BCP no tiene archivo histórico propio, pero web.archive.org
 * conserva la portada desde 2025. Cada copia se lee con el mismo lector que la
 * del día, y el punto lleva como fuente la copia exacta (`/web/<fecha>/…`), no
 * la portada de hoy: quien siga el enlace ve la cifra que se anotó. Una copia
 * sin cinta —las hay— no escribe nada. Sólo agrega días: lo que la lectura
 * diaria ya tenía no se toca.
 *
 * Uso: `tsx scripts/banks/backfill-quote-archive.ts BCP [desde AAAAMMDD]`
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'bank-virtual-assets.json');
const USER_AGENT = 'Mozilla/5.0 (compatible; ObservatorioEconomico/1.0; datosbolivia.com)';

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** «20250605143012» → la fecha y hora UTC que nombra. */
const stamped = (timestamp: string): Date =>
  new Date(
    `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T` +
      `${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}Z`,
  );

async function main(): Promise<void> {
  const [bank, since = '20250101'] = process.argv.slice(2);
  const feed = QUOTE_FEEDS.find((one) => one.bank === bank);
  if (!feed) throw new Error(`no hay cotización publicada para «${bank ?? ''}»`);
  const index = new URL('https://web.archive.org/cdx/search/cdx');
  index.search = new URLSearchParams({
    url: new URL(feed.url).host + new URL(feed.url).pathname,
    output: 'json',
    from: since,
    filter: 'statuscode:200',
    // La última copia de cada día: la cifra con la que cerró.
    collapse: 'timestamp:8',
  }).toString();
  const rows = JSON.parse((await download(index.toString())).toString('utf8')) as string[][];
  const copies = rows.slice(1).map(([, timestamp, original]) => ({ timestamp, original }));
  console.log(`${copies.length} copias de ${feed.url} desde ${since}`);

  const readings: Reading[] = [];
  const today = laPazDate(new Date());
  for (const { timestamp, original } of copies) {
    if (!timestamp || !original) continue;
    const day = laPazDate(stamped(timestamp));
    if (day >= today) continue;
    // `id_` sirve los bytes que guardó el archivo, sin la barra que le agrega.
    const raw = `https://web.archive.org/web/${timestamp}id_/${original}`;
    const shown = `https://web.archive.org/web/${timestamp}/${original}`;
    try {
      const one = readQuoteFeed(feed, await download(raw), day, new Date(), shown);
      readings.push(...one);
      console.log(`${day}: ${one.map((reading) => reading.point.excerpt)[0]}`);
    } catch (error) {
      console.log(`${day}: sin cifra (${(error as Error).message})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  if (!readings.length) throw new Error('ninguna copia trae la cotización: no se toca la semilla');

  const previous = existsSync(SEED)
    ? bankVirtualAssetsSchema.parse(JSON.parse(readFileSync(SEED, 'utf8'))).series
    : [];
  // Un día que la lectura diaria ya tenía se queda con la suya.
  const held = new Set(
    previous.flatMap((series) => series.points.map((point) => `${series.indicatorCode}|${point.date}`)),
  );
  const fresh = readings.filter((reading) => !held.has(`${reading.indicatorCode}|${reading.point.date}`));
  const { series } = bankVirtualAssetsSchema.parse({ series: mergeSeed(previous, fresh) });
  writeFileSync(SEED, `${JSON.stringify({ series }, null, 2)}\n`);
  console.log(`semilla escrita: ${fresh.length} puntos nuevos de ${bank}`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'archive backfill failed'}\n`);
  process.exitCode = 1;
});
