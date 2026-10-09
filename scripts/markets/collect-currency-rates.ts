import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { coherent, parseCurrencyTable } from './bcb-currency-table';
import type { CurrencyRow } from './bcb-currency-table';

/**
 * Acumula el boliviano frente a las monedas que publica el BCB: `yarn fx:currencies`.
 *
 * Una semilla por moneda en `exogenous-currencies/`. Cada punto es el valor de
 * una moneda en bolivianos el día que la tabla del BCB declara y lleva su propia
 * procedencia —la dirección de esa tabla, su huella y la fila literal—, porque
 * el archivo crece cada día y una procedencia común cambiaría con cada corrida.
 *
 * Dos modos:
 *
 * - Diario (el del lote): pide la tabla de los días que faltan desde el último
 *   guardado hasta hoy, y el último de cada moneda no se reescribe. Falla si
 *   pasan más de cinco días sin cifra nueva: una semilla que no crece se ve
 *   igual que una al día hasta que alguien mira la fecha.
 * - `--gaps`: las semanas de la carga histórica a las que el BCB no publicó tabla el lunes.
 * - `--backfill [AAAA-MM-DD] [paso]`: la historia, una tabla por semana desde
 *   la fecha dada (por omisión 2010-01-04). Se corre a mano una vez; es lo que
 *   hace que el gráfico no empiece hoy. El panel dice que el pasado es semanal.
 *
 * Las cotizaciones del BCB son indicativas salvo la del dólar. Una fila cuyo
 * producto con el dólar oficial no devuelve el dólar (más del 2 %) no entra.
 */

const DIRECTORY = join('src', 'database', 'seeds', 'boot', 'exogenous-currencies');
const PAGE = 'https://www.bcb.gob.bo/librerias/indicadores/otras/otras_imprimir.php';
const LATEST = 'https://www.bcb.gob.bo/librerias/indicadores/otras/ultimo.php';
const UA = 'observatorio-economico-bolivia/1.0 (+datos abiertos)';
const STALE_AFTER_DAYS = 5;
const PAUSE_MS = 350;
const FIRST_BACKFILL = '2010-01-04';

/** El nombre y el país de cada moneda que entra al tablero. */
const CATALOG: Record<string, readonly [label: string, country: string]> = {
  USD: ['Dólar estadounidense (oficial)', 'Estados Unidos'],
  ARS: ['Peso argentino', 'Argentina'],
  BRL: ['Real brasileño', 'Brasil'],
  CLP: ['Peso chileno', 'Chile'],
  COP: ['Peso colombiano', 'Colombia'],
  PEN: ['Sol peruano', 'Perú'],
  PYG: ['Guaraní paraguayo', 'Paraguay'],
  UYU: ['Peso uruguayo', 'Uruguay'],
  MXN: ['Peso mexicano', 'México'],
  CNY: ['Yuan renminbi', 'China'],
  CNH: ['Yuan renminbi (mercado externo)', 'China'],
  JPY: ['Yen japonés', 'Japón'],
  KRW: ['Won surcoreano', 'Corea del Sur'],
  INR: ['Rupia india', 'India'],
  HKD: ['Dólar de Hong Kong', 'Hong Kong'],
  AED: ['Dirham de los Emiratos', 'Emiratos Árabes Unidos'],
  EUR: ['Euro', 'Unión Europea'],
  GBP: ['Libra esterlina', 'Reino Unido'],
  CHF: ['Franco suizo', 'Suiza'],
  CAD: ['Dólar canadiense', 'Canadá'],
  AUD: ['Dólar australiano', 'Australia'],
  NOK: ['Corona noruega', 'Noruega'],
  SEK: ['Corona sueca', 'Suecia'],
};

interface Point {
  period: string;
  value: string;
  excerpt: string;
  sourceUrl: string;
  upstreamSha256: string;
  retrievedAt: string;
}

interface Series {
  indicatorCode: string;
  group: 'CURRENCY';
  product: string;
  productLabel: string;
  name: string;
  scope: 'BCB_OFFICIAL';
  market: string;
  unit: string;
  kind: 'PRICE';
  note: string;
  publisher: string;
  frequency: 'DAILY';
  points: Point[];
}

const NOTE =
  'Bolivianos por una unidad de la moneda, tabla de cotizaciones del Banco Central de Bolivia. Es indicativa salvo la del dólar y sale del dólar oficial por el cruce de mercado. Hasta 2026 la historia es semanal; después, diaria.';

const seriesOf = (iso: string, points: Point[]): Series => {
  const [label, country] = CATALOG[iso] ?? [iso, iso];
  return {
    indicatorCode: `EXO_FX_${iso}`,
    group: 'CURRENCY',
    product: iso,
    productLabel: label,
    name: `${label} frente al boliviano`,
    scope: 'BCB_OFFICIAL',
    market: country,
    unit: 'Bs por unidad',
    kind: 'PRICE',
    note: NOTE,
    publisher: 'BANCO CENTRAL DE BOLIVIA',
    frequency: 'DAILY',
    points,
  };
};

const file = (iso: string): string => join(DIRECTORY, `${iso}.json`);

function held(iso: string): Series | null {
  return existsSync(file(iso))
    ? (JSON.parse(readFileSync(file(iso), 'utf-8')) as { series: Series[] }).series[0] ?? null
    : null;
}

const day = (at: Date): string => at.toISOString().slice(0, 10);
const shift = (date: string, days: number): string =>
  day(new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000));
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchTable(url: string): Promise<{ html: string; sha256: string } | null> {
  let failure = 'sin respuesta';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(45_000),
      });
      failure = `respondió ${response.status}`;
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        return {
          html: bytes.toString('latin1'),
          sha256: createHash('sha256').update(bytes).digest('hex'),
        };
      }
    } catch (error: unknown) {
      failure = error instanceof Error ? error.message : 'fallo de red';
    }
    await sleep(1_500 * attempt);
  }
  process.stderr.write(`  ${url}: ${failure}\n`);
  return null;
}

const pageFor = (date: string): string =>
  `${PAGE}?qdd=${date.slice(8, 10)}&qmm=${date.slice(5, 7)}&qaa=${date.slice(0, 4)}`;

/** Lee las tablas de las fechas pedidas y devuelve los puntos nuevos por moneda. */
async function collect(
  dates: readonly string[],
  have: Map<string, Set<string>>,
  fresh: Map<string, Point[]>,
): Promise<number> {
  let tables = 0;
  const seenPages = new Set<string>();
  for (const date of dates) {
    const url = date === 'latest' ? LATEST : pageFor(date);
    const got = await fetchTable(url);
    await sleep(PAUSE_MS);
    if (!got) continue;
    let table;
    try {
      table = parseCurrencyTable(got.html);
    } catch (error: unknown) {
      console.log(`  ${date}: ${error instanceof Error ? error.message : 'ilegible'}`);
      continue;
    }
    // Un domingo se pide y contesta la tabla del lunes: una tabla cuenta una vez.
    if (seenPages.has(table.effectiveDate)) continue;
    seenPages.add(table.effectiveDate);
    tables += 1;
    const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;
    for (const row of table.rows as readonly CurrencyRow[]) {
      if (!CATALOG[row.iso] || !coherent(row, table.officialUsd)) continue;
      if (have.get(row.iso)?.has(table.effectiveDate)) continue;
      have.get(row.iso)?.add(table.effectiveDate);
      const own = fresh.get(row.iso) ?? [];
      own.push({
        period: table.effectiveDate,
        value: row.bobPerUnit,
        excerpt: row.excerpt,
        sourceUrl: date === 'latest' ? pageFor(table.effectiveDate) : url,
        upstreamSha256: got.sha256,
        retrievedAt,
      });
      fresh.set(row.iso, own);
    }
  }
  return tables;
}

function weekly(from: string, step: number, to: string): string[] {
  const out: string[] = [];
  for (let date = from; date <= to; date = shift(date, step)) out.push(date);
  return out;
}

async function main(): Promise<void> {
  mkdirSync(DIRECTORY, { recursive: true });
  const args = process.argv.slice(2);
  const backfill = args[0] === '--backfill';
  const today = day(new Date());

  const have = new Map<string, Set<string>>();
  let newest = '';
  for (const iso of Object.keys(CATALOG)) {
    const points = held(iso)?.points ?? [];
    have.set(iso, new Set(points.map((point) => point.period)));
    const last = points.at(-1)?.period ?? '';
    if (last > newest) newest = last;
  }

  let dates: string[];
  if (args[0] === '--gaps') {
    // Una semana sin tabla —el BCB no publicó ese día— se pide otra vez el martes y el miércoles.
    const held = [...(have.get('USD') ?? [])].sort();
    dates = weekly(FIRST_BACKFILL, 7, today)
      .filter((monday) => !held.some((date) => Math.abs(Date.parse(date) - Date.parse(monday)) <= 3 * 86_400_000))
      .flatMap((monday) => [shift(monday, 1), shift(monday, 2)]);
  } else if (backfill) {
    dates = weekly(args[1] ?? FIRST_BACKFILL, Number(args[2] ?? 7), today);
  } else {
    const from = newest ? shift(newest, 1) : shift(today, -7);
    dates = from < today ? weekly(from, 1, shift(today, -1)) : [];
    dates.push('latest');
  }
  console.log(`\nexogenous-currencies: ${dates.length} fechas por pedir`);

  const fresh = new Map<string, Point[]>();
  const tables = await collect(dates, have, fresh);

  let written = 0;
  for (const iso of Object.keys(CATALOG)) {
    const add = fresh.get(iso);
    if (!add?.length) continue;
    const merged = [...(held(iso)?.points ?? []), ...add].sort((a, b) =>
      a.period.localeCompare(b.period),
    );
    writeFileSync(file(iso), `${JSON.stringify({ series: [seriesOf(iso, merged)] }, null, 2)}\n`, 'utf-8');
    written += add.length;
  }
  console.log(`  ${tables} tablas leídas, ${written} lecturas nuevas`);

  if (!backfill && args[0] !== '--gaps') {
    const last = [...have.values()].flatMap((set) => [...set]).sort().at(-1) ?? '';
    const age = Math.floor((Date.parse(today) - Date.parse(last || '1970-01-01')) / 86_400_000);
    if (age > STALE_AFTER_DAYS) {
      throw new Error(`la última cotización guardada es del ${last}: hace ${age} días`);
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'currency collection failed'}\n`);
  process.exitCode = 1;
});
