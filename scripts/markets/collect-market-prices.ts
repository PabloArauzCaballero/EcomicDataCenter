import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Rebuilds `src/database/seeds/boot/market-prices.json` from a public exchange.
 *
 * Three markets that bear on the Bolivian dollar, and one that is deliberately
 * absent.
 *
 * Bitcoin and Tether are here because in Bolivia they are not a curiosity: with
 * the official rate rationed, USDT is a channel through which dollars are
 * actually obtained, so its peg holding or slipping is a fact about the
 * parallel market rather than about crypto. Gold arrives as PAXG, a token
 * redeemable one-to-one for allocated bullion, and is labelled as such — it
 * tracks spot closely but it is not the London fix, and calling it "gold"
 * without that qualification would overstate what was measured.
 *
 * Diamonds were requested and are not here. There is no public diamond price
 * series: the trade prices off Rapaport's subscription list, which is neither
 * free nor citable, and no exchange quotes a diamond contract. Inventing a
 * proxy would be worse than the gap.
 *
 * Run with `yarn markets:collect`.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'market-prices.json');
const UA = 'ObservatorioEconomicoBO/1.0';
const ENDPOINT = 'https://api.kraken.com/0/public/OHLC';

interface Market {
  readonly code: string;
  readonly pair: string;
  readonly name: string;
  readonly unit: string;
  readonly note: string;
}

const MARKETS: readonly Market[] = [
  {
    code: 'BTC_USD',
    pair: 'XBTUSD',
    name: 'Bitcoin',
    unit: 'USD',
    note: 'Cierre diario en dólares',
  },
  {
    code: 'USDT_USD',
    pair: 'USDTZUSD',
    name: 'Tether (USDT)',
    unit: 'USD',
    note: 'Estable anclado al dólar; su desvío mide tensión en el canal cripto',
  },
  {
    code: 'XAU_USD',
    pair: 'PAXGUSD',
    name: 'Oro (PAX Gold)',
    unit: 'USD',
    note: 'Token redimible por una onza troy asignada; sigue al contado, no es el fixing de Londres',
  },
];

interface Candle {
  readonly date: string;
  readonly close: string;
  readonly low: string;
  readonly high: string;
  readonly excerpt: string;
}

interface Series {
  indicatorCode: string;
  name: string;
  unit: string;
  note: string;
  provenance: {
    publisher: string;
    sourceUrl: string;
    retrievedAt: string;
    upstreamSha256: string;
    frequency: 'DAILY';
  };
  points: Candle[];
}

/** The exchange answers `{error, result:{<pair>:[[time,o,h,l,c,…]], last}}`. */
function candlesFrom(payload: unknown): unknown[][] {
  if (typeof payload !== 'object' || payload === null) return [];
  const result = (payload as { result?: unknown }).result;
  if (typeof result !== 'object' || result === null) return [];
  for (const [key, value] of Object.entries(result)) {
    if (key !== 'last' && Array.isArray(value)) return value as unknown[][];
  }
  return [];
}

const numeric = (value: unknown): string | null => {
  const text = String(value);
  return /^-?\d+(\.\d+)?$/u.test(text) ? text : null;
};

async function collect(market: Market, retrievedAt: string): Promise<Series | null> {
  const url = `${ENDPOINT}?pair=${market.pair}&interval=1440`;
  const response = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    console.warn(`  ${market.code}: HTTP ${response.status}, omitido`);
    return null;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  const payload: unknown = JSON.parse(bytes.toString('utf-8'));

  const points: Candle[] = [];
  for (const candle of candlesFrom(payload)) {
    const stamp = Number(candle[0]);
    const close = numeric(candle[4]);
    const high = numeric(candle[2]);
    const low = numeric(candle[3]);
    if (!Number.isFinite(stamp) || !close || !high || !low) continue;
    points.push({
      date: new Date(stamp * 1000).toISOString().slice(0, 10),
      close,
      low,
      high,
      // The verbatim candle, so a figure can be checked against what was served.
      excerpt: JSON.stringify(candle),
    });
  }
  if (points.length < 30) {
    console.warn(`  ${market.code}: sólo ${points.length} velas, omitido`);
    return null;
  }
  console.log(
    `  ${market.code.padEnd(9)} ${points.length} días  ${points[0]?.date} → ${points.at(-1)?.date}`,
  );
  return {
    indicatorCode: market.code,
    name: market.name,
    unit: market.unit,
    note: market.note,
    provenance: {
      publisher: 'KRAKEN',
      sourceUrl: url,
      retrievedAt,
      upstreamSha256: digest,
      frequency: 'DAILY',
    },
    points,
  };
}

async function main(): Promise<void> {
  const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;
  console.log('Mercados:');
  const series: Series[] = [];
  for (const market of MARKETS) {
    const collected = await collect(market, retrievedAt);
    if (collected) series.push(collected);
    await new Promise((resolve) => setTimeout(resolve, 1_200));
  }
  if (!series.length) throw new Error('Ningún mercado respondió');

  writeFileSync(SEED, `${JSON.stringify({ series }, null, 2)}\n`, 'utf-8');
  const total = series.reduce((sum, entry) => sum + entry.points.length, 0);
  console.log(`\n${series.length} mercados, ${total} cierres diarios escritos en ${SEED}`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Market collection failed'}\n`);
  process.exitCode = 1;
});
