import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ppi } from './exogenous-spec';
import type { ExogenousSpec } from './exogenous-spec';
import { download, plainNumber } from './exogenous-readers';
import type { Download, MonthlyPoint } from './exogenous-readers';

/**
 * Lo que cuesta mover la carga: el contenedor, el flete aéreo y los índices de
 * transporte.
 *
 * Tres lecturas distintas y el ámbito las separa:
 *
 * - `WORLD`, de Freightos: dólares por contenedor de 40 pies (FBX, global y por
 *   ruta) y dólares por tonelada aérea (FAX). Es el precio que paga un
 *   exportador, no un índice. Freightos no publica una API abierta: la página
 *   lleva sus gráficos en el HTML, y de ahí se leen.
 * - `US_PRODUCER_INDEX`, de FRED: el índice de productor del flete marítimo y
 *   aéreo de EE. UU., que sí tiene veinticinco años de historia.
 *
 * La página sólo muestra las últimas trece semanas, y el valor por ruta sólo
 * el de la semana más reciente. Por eso cada semana vista se guarda en un
 * archivo de estado y el mes se promedia de lo guardado: la historia empieza el
 * día en que se instaló el colector y crece sola. Ninguna cifra se completa ni
 * se estima: un mes con una sola semana dice que es de una semana.
 *
 * Las rutas que tocan a Bolivia son dos: Europa → costa este de Sudamérica
 * (Santos, Buenos Aires) y Europa → costa oeste (San Antonio, Callao). Sólo
 * existen en el sentido de ida; la vuelta, la de quien exporta, no se publica,
 * y el panel lo dice.
 */

export const FREIGHTOS_FBX = 'https://fbx.freightos.com/';
export const FREIGHTOS_FAX = 'https://www.freightos.com/enterprise/terminal/fax-global-freightos-air-index/';
const WEEKS = join('src', 'database', 'seeds', 'boot', 'exogenous-freight-weeks.json');

const CONTAINER_UNIT = 'US$/contenedor 40 pies';
const FBX_NOTE =
  'Precio de mercado de un contenedor de 40 pies, promedio del mes de las semanas publicadas (Freightos Baltic Index). El promedio mundial no es la tarifa de Bolivia; las rutas hacia Sudamérica sólo existen desde Europa.';

const lane = (
  ticker: string,
  label: string,
  note = FBX_NOTE,
): ExogenousSpec => ({
  code: `EXO_FREIGHT_${ticker}`,
  group: 'FREIGHT',
  product: 'CONTAINER',
  productLabel: 'Contenedor',
  name: label,
  scope: 'WORLD',
  market: ticker === 'FBX' ? 'Mundo' : label,
  unit: CONTAINER_UNIT,
  kind: 'PRICE',
  note,
  origin: { kind: 'FREIGHTOS', ticker },
});

const FBX_LANES: ReadonlyArray<readonly [string, string]> = [
  ['FBX01', 'China/Asia Oriental → costa oeste de EE. UU.'],
  ['FBX02', 'Costa oeste de EE. UU. → China/Asia Oriental'],
  ['FBX03', 'China/Asia Oriental → costa este de EE. UU.'],
  ['FBX04', 'Costa este de EE. UU. → China/Asia Oriental'],
  ['FBX11', 'China/Asia Oriental → norte de Europa'],
  ['FBX12', 'Norte de Europa → China/Asia Oriental'],
  ['FBX13', 'China/Asia Oriental → Mediterráneo'],
  ['FBX14', 'Mediterráneo → China/Asia Oriental'],
  ['FBX21', 'Costa este de EE. UU. → norte de Europa'],
  ['FBX22', 'Norte de Europa → costa este de EE. UU.'],
  ['FBX24', 'Europa → costa este de Sudamérica (Santos, Buenos Aires)'],
  ['FBX26', 'Europa → costa oeste de Sudamérica (San Antonio, Callao)'],
];

const AIR: ExogenousSpec = {
  code: 'EXO_FREIGHT_FAX',
  group: 'FREIGHT',
  product: 'AIR_FREIGHT',
  productLabel: 'Flete aéreo',
  name: 'Flete aéreo mundial por tonelada',
  scope: 'WORLD',
  market: 'Mundo',
  unit: 'US$/tonelada',
  kind: 'PRICE',
  note: 'Tarifa aérea de carga por tonelada, promedio del mes de las semanas publicadas (Freightos Air Index). Freightos la publica en dólares por kilo; aquí se multiplica por mil.',
  origin: { kind: 'FREIGHTOS', ticker: 'FAX' },
};

const index = (
  code: string,
  id: string,
  product: string,
  productLabel: string,
  name: string,
  note: string,
): ExogenousSpec => {
  const base = ppi(code, id, 'FREIGHT', product, productLabel, name);
  return { ...base, note: `${base.note} ${note}` };
};

const INDEXES: readonly ExogenousSpec[] = [
  index(
    'FREIGHT_SEA_PPI',
    'PCU483111483111',
    'SEA_FREIGHT',
    'Flete marítimo',
    'Flete marítimo de altura (índice de productor EE. UU.)',
    'Transporte de carga por mar en viajes internacionales.',
  ),
  index(
    'FREIGHT_AIR_PPI',
    'PCU481112481112',
    'AIR_FREIGHT',
    'Flete aéreo',
    'Carga aérea regular (índice de productor EE. UU.)',
    'Tarifa de la carga aérea regular. Historia larga del flete aéreo mientras el precio por tonelada acumula la suya.',
  ),
  index(
    'FREIGHT_LOGISTICS_PPI',
    'PCU488510488510',
    'LOGISTICS',
    'Agentes de carga',
    'Agentes de carga y logística (índice de productor EE. UU.)',
    'Lo que cobran los agentes que arreglan el transporte de la carga.',
  ),
];

export const FREIGHT_SERIES: readonly ExogenousSpec[] = [
  lane('FBX', 'Contenedor de 40 pies, promedio mundial'),
  ...FBX_LANES.map(([ticker, label]) => lane(ticker, label)),
  AIR,
  ...INDEXES,
];

/** Las semanas ya vistas: ticker → semana (viernes) → cifra tal como la escribió Freightos. */
type Weeks = Record<string, Record<string, string>>;

function heldWeeks(): Weeks {
  return existsSync(WEEKS) ? (JSON.parse(readFileSync(WEEKS, 'utf-8')) as Weeks) : {};
}

interface Page {
  readonly file: Download;
  readonly chart: ReadonlyArray<{ ticker?: string; indexDate: string; value: number }>;
  readonly ticker: ReadonlyArray<{ label: string; value: string }>;
}

/** El JSON que la página de Freightos pone en el HTML para pintar su gráfico. */
async function page(url: string): Promise<Page> {
  const file = await download(url);
  const html = file.bytes.toString('utf-8');
  const grab = (name: string): unknown[] => {
    const match = new RegExp(`frProductIntro${name}Data\\[[^\\]]*\\]\\s*=\\s*(\\[.*?\\]);`, 's').exec(
      html,
    );
    if (!match?.[1]) throw new Error(`la página de Freightos ya no trae sus datos de ${name}`);
    return JSON.parse(match[1]) as unknown[];
  };
  return {
    file,
    chart: grab('Chart') as Page['chart'],
    ticker: grab('Ticker') as Page['ticker'],
  };
}

const money = (text: string): string | null => plainNumber(text.replace(/[$,\s]/gu, ''));

export interface FreightosRead {
  readonly weeks: Weeks;
  readonly files: Map<string, Download>;
}

/** Suma a las semanas guardadas lo que muestran hoy las dos páginas. */
export async function readFreightos(): Promise<FreightosRead> {
  const weeks = heldWeeks();
  const files = new Map<string, Download>();
  const put = (ticker: string, week: string, value: string | null) => {
    if (value === null) return;
    (weeks[ticker] ??= {})[week] = value;
  };

  const sea = await page(FREIGHTOS_FBX);
  files.set('FBX', sea.file);
  const global = sea.chart.filter((point) => point.ticker === 'FBX');
  for (const point of global) put('FBX', point.indexDate, plainNumber(String(point.value)));
  /*
   * El rótulo de cada ruta trae sólo la semana más reciente, la misma del
   * último punto del gráfico global: la cifra del rótulo FBX coincide con él.
   */
  const latest = global.at(-1)?.indexDate;
  if (latest) {
    for (const item of sea.ticker) {
      if (item.label !== 'FBX') put(item.label, latest, money(item.value));
      if (item.label !== 'FBX') files.set(item.label, sea.file);
    }
  }

  const air = await page(FREIGHTOS_FAX);
  files.set('FAX', air.file);
  for (const point of air.chart) {
    // Freightos da dólares por kilo; la serie va en dólares por tonelada.
    put('FAX', point.indexDate, plainNumber((Math.round(point.value * 1_000_000) / 1_000).toFixed(3)));
  }
  return { weeks, files };
}

export function saveWeeks(weeks: Weeks): void {
  const sorted: Weeks = {};
  for (const ticker of Object.keys(weeks).sort()) {
    const own = weeks[ticker] ?? {};
    sorted[ticker] = Object.fromEntries(Object.entries(own).sort(([a], [b]) => a.localeCompare(b)));
  }
  const text = `${JSON.stringify(sorted, null, 2)}\n`;
  if (!existsSync(WEEKS) || readFileSync(WEEKS, 'utf-8') !== text) writeFileSync(WEEKS, text, 'utf-8');
}

/** El promedio mensual de las semanas guardadas, sin el mes en curso. */
export function monthsOf(
  own: Record<string, string> | undefined,
  closed: (period: string) => boolean,
  unit: string,
): MonthlyPoint[] {
  const byMonth = new Map<string, Array<[string, string]>>();
  for (const [week, value] of Object.entries(own ?? {})) {
    const period = week.slice(0, 7);
    if (!closed(period)) continue;
    byMonth.set(period, [...(byMonth.get(period) ?? []), [week, value]]);
  }
  const out: MonthlyPoint[] = [];
  for (const [period, items] of [...byMonth].sort(([a], [b]) => a.localeCompare(b))) {
    const mean = items.reduce((sum, [, value]) => sum + Number(value), 0) / items.length;
    const value = plainNumber(mean.toFixed(3));
    if (value === null) continue;
    const seen = items.map(([week, figure]) => `${week}: ${figure}`).join('; ');
    out.push({
      period,
      value,
      excerpt: `${items.length} sem. (${seen}) ${unit} | promedio ${value}`,
    });
  }
  return out;
}
