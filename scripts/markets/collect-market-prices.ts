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
 * The venue is chosen for depth. An exchange that answers with its most recent
 * seven hundred candles cannot show a reader the cycle they are living through,
 * so this reads a venue that pages backwards and walks it to 2020.
 *
 * Run with `yarn markets:collect`.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'market-prices.json');
const UA = 'ObservatorioEconomicoBO/1.0';
const ENDPOINT = 'https://api.binance.com/api/v3/klines';
const FROM = Date.UTC(2020, 0, 1);

interface Market {
  readonly code: string;
  readonly symbol: string;
  readonly name: string;
  readonly unit: string;
  readonly note: string;
}

const MARKETS: readonly Market[] = [
  {
    code: 'BTC_USD',
    symbol: 'BTCUSDT',
    name: 'Bitcoin',
    unit: 'USD',
    note: 'Cierre diario contra el estable anclado al dólar',
  },
  {
    code: 'USDT_USD',
    symbol: 'USDCUSDT',
    name: 'Tether contra USD Coin',
    unit: 'USD',
    note: 'Dos estables anclados al dólar; su desvío mide tensión en el canal cripto',
  },
  {
    code: 'XAU_USD',
    symbol: 'PAXGUSDT',
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

const numeric = (value: unknown): string | null => {
  const text = String(value);
  if (!/^-?\d+(\.\d+)?$/u.test(text)) return null;
  // The venue pads to eight decimals; a price of 1.00010000 is 1.0001.
  return text.includes('.') ? text.replace(/0+$/u, '').replace(/\.$/u, '') : text;
};

/** One window of daily candles, oldest first. */
async function window(
  symbol: string,
  since: number,
): Promise<{ rows: unknown[][]; digest: string }> {
  const url = `${ENDPOINT}?symbol=${symbol}&interval=1d&startTime=${since}&limit=1000`;
  const response = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`${symbol}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const parsed: unknown = JSON.parse(bytes.toString('utf-8'));
  return {
    rows: Array.isArray(parsed) ? (parsed as unknown[][]) : [],
    digest: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function collect(market: Market, retrievedAt: string): Promise<Series | null> {
  const points: Candle[] = [];
  const seen = new Set<string>();
  let cursor = FROM;
  let digest = '';

  // Walk forward a thousand days at a time until the venue stops answering with
  // anything new, which is how it says "that is all there is".
  for (let round = 0; round < 12; round += 1) {
    let batch;
    try {
      batch = await window(market.symbol, cursor);
    } catch (error) {
      console.warn(`  ${market.code}: ${error instanceof Error ? error.message : 'fallo'}`);
      break;
    }
    if (!batch.rows.length) break;
    digest = batch.digest;

    let advanced = false;
    for (const candle of batch.rows) {
      const stamp = Number(candle[0]);
      const close = numeric(candle[4]);
      const high = numeric(candle[2]);
      const low = numeric(candle[3]);
      if (!Number.isFinite(stamp) || !close || !high || !low) continue;
      const date = new Date(stamp).toISOString().slice(0, 10);
      if (seen.has(date)) continue;
      seen.add(date);
      advanced = true;
      points.push({
        date,
        close,
        low,
        high,
        // The verbatim candle, so a figure can be checked against what was served.
        excerpt: JSON.stringify(candle),
      });
    }
    if (!advanced) break;
    const last = batch.rows.at(-1)?.[0];
    if (typeof last !== 'number') break;
    cursor = last + 86_400_000;
    if (cursor > Date.now()) break;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  if (points.length < 30) {
    console.warn(`  ${market.code}: sólo ${points.length} velas, omitido`);
    return null;
  }
  points.sort((left, right) => left.date.localeCompare(right.date));
  console.log(
    `  ${market.code.padEnd(9)} ${String(points.length).padStart(5)} días  ` +
      `${points[0]?.date} → ${points.at(-1)?.date}`,
  );
  return {
    indicatorCode: market.code,
    name: market.name,
    unit: market.unit,
    note: market.note,
    provenance: {
      publisher: 'BINANCE',
      sourceUrl: `${ENDPOINT}?symbol=${market.symbol}&interval=1d`,
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
