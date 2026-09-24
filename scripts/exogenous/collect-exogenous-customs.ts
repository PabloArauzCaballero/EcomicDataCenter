import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { download, sleep } from './exogenous-readers';
import {
  COMTRADE_PREVIEW,
  CUSTOMS_SERIES,
  FIRST_YEAR,
  PUBLISHER,
  REPORTER,
} from './exogenous-customs-sources';
import type { CustomsSpec } from './exogenous-customs-sources';

/**
 * El precio por kilo al que Bolivia compró y vendió: `yarn exogenous:customs`.
 *
 * Dos peticiones por año —una por flujo— con todas las partidas del flujo en
 * el mismo `cmdCode`, como el colector de minerales: el servicio de vista
 * previa tiene cuota y una petición por partida no terminaría. Anual y a mano:
 * la declaración de un año se cierra cuando el año termina, así que correrlo
 * en el lote diario sería pedir 32 veces lo mismo cada ocho horas.
 *
 * Se guardan las dos cifras que el registro declara —valor y peso neto— y su
 * cociente. El cociente es lo que se dibuja; las otras dos son las que el
 * extracto permite comprobar.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'exogenous-customs.json');
const PAUSE_MS = 2_000;

interface Row {
  readonly cmdCode: string;
  readonly flowCode: string;
  readonly motCode: number;
  readonly customsCode: string;
  readonly partner2Code: number;
  readonly primaryValue: number | null;
  readonly netWgt: number | null;
}

interface Point {
  period: string;
  value: string;
  tradeValueUsd: string;
  netWeightKg: string;
  excerpt: string;
  sourceUrl: string;
  upstreamSha256: string;
  retrievedAt: string;
}

/** La fila donde los tres desgloses se anulan: el total que el registro declara. */
const totalRow = (rows: readonly Row[], hs: string): Row | undefined =>
  rows.find(
    (row) =>
      row.cmdCode === hs &&
      row.motCode === 0 &&
      row.customsCode === 'C00' &&
      row.partner2Code === 0,
  );

/**
 * Valor entre peso, a cuatro decimales. Sin peso no hay precio: una
 * declaración que calla el peso no se convierte en cero, se salta.
 */
function unitValue(
  row: Row,
): Omit<Point, 'period' | 'excerpt' | 'sourceUrl' | 'upstreamSha256' | 'retrievedAt'> | null {
  const value = row.primaryValue;
  const weight = row.netWgt;
  if (typeof value !== 'number' || typeof weight !== 'number' || value <= 0 || weight <= 0) {
    return null;
  }
  return {
    value: (value / weight).toFixed(4).replace(/\.?0+$/u, ''),
    tradeValueUsd: String(value),
    netWeightKg: String(weight),
  };
}

async function collectFlow(
  flow: 'X' | 'M',
  year: number,
  at: string,
  points: Map<string, Point[]>,
) {
  const specs = CUSTOMS_SERIES.filter((spec) => spec.flow === flow);
  const codes = [...new Set(specs.flatMap((spec) => spec.hs))];
  const url =
    `${COMTRADE_PREVIEW}?reporterCode=${REPORTER}&period=${year}&partnerCode=0` +
    `&cmdCode=${codes.join(',')}&flowCode=${flow}`;
  const file = await download(url);
  const rows = (JSON.parse(file.bytes.toString('utf-8')) as { data?: Row[] }).data ?? [];
  let found = 0;
  for (const spec of specs) {
    const row = spec.hs.map((hs) => totalRow(rows, hs)).find((one) => one !== undefined);
    const unit = row ? unitValue(row) : null;
    if (!row || !unit) continue;
    const own = points.get(spec.code) ?? [];
    own.push({
      period: String(year),
      ...unit,
      excerpt: JSON.stringify(row),
      sourceUrl: url,
      upstreamSha256: file.sha256,
      retrievedAt: at,
    });
    points.set(spec.code, own);
    found += 1;
  }
  console.log(
    `  ${year} ${flow}  ${String(found).padStart(2)} de ${specs.length} partidas con valor y peso`,
  );
}

function seriesOf(spec: CustomsSpec, points: Point[]) {
  return {
    indicatorCode: spec.code,
    group: spec.group,
    product: spec.product,
    productLabel: spec.productLabel,
    name: spec.name,
    scope: 'BOLIVIA_CUSTOMS',
    market: spec.flow === 'X' ? 'Exportación de Bolivia' : 'Importación de Bolivia',
    unit: 'US$/kg',
    kind: 'PRICE',
    note: spec.note,
    publisher: PUBLISHER,
    frequency: 'ANNUAL',
    points,
  };
}

async function main(): Promise<void> {
  const closed = new Date().getUTCFullYear() - 1;
  const at = `${new Date().toISOString().slice(0, 19)}Z`;
  console.log(`\nexogenous-customs.json  (${FIRST_YEAR}-${closed})`);
  const points = new Map<string, Point[]>();
  for (let year = FIRST_YEAR; year <= closed; year += 1) {
    for (const flow of ['X', 'M'] as const) {
      await collectFlow(flow, year, at, points);
      await sleep(PAUSE_MS);
    }
  }
  const series = CUSTOMS_SERIES.flatMap((spec) => {
    const own = points.get(spec.code);
    if (own?.length) return [seriesOf(spec, own)];
    console.log(`  ${spec.code.padEnd(40)} sin una sola declaración con peso`);
    return [];
  });
  writeFileSync(SEED, `${JSON.stringify({ series }, null, 2)}\n`, 'utf-8');
  const total = series.reduce((count, one) => count + one.points.length, 0);
  console.log(`  -> ${series.length} series, ${total} observaciones`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'customs collection failed'}\n`);
  process.exitCode = 1;
});
