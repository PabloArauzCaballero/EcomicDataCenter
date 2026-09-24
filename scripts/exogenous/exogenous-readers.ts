import { createHash } from 'node:crypto';
import { Workbook } from '../macro/xlsx-cells';
import {
  FAO_PRICES,
  FIRST_MONTH,
  FRED_CSV,
  USER_AGENT,
  WORLD_BANK_PAGE,
} from './exogenous-sources';

/**
 * Los tres lectores del colector mensual, uno por publicador.
 *
 * Cada uno devuelve lo mismo: los puntos de una serie, con la dirección y la
 * huella de la descarga de la que salieron y, por punto, el pedazo literal del
 * archivo que dice esa cifra. Ninguno convierte unidades ni redondea: la cifra
 * que entra es la que el publicador escribió.
 */

export interface MonthlyPoint {
  readonly period: string;
  readonly value: string;
  readonly excerpt: string;
}

export interface Download {
  readonly url: string;
  readonly sha256: string;
  readonly bytes: Buffer;
}

const ATTEMPTS = 4;
const PAUSE_MS = 1_500;

export const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function download(url: string): Promise<Download> {
  let failure = 'sin intentos';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        return { url, bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
      }
      failure = `respondió ${response.status}`;
    } catch (error: unknown) {
      failure = error instanceof Error ? error.message : 'fallo de red';
    }
    await sleep(PAUSE_MS * attempt * 2);
  }
  throw new Error(`${url}: ${failure} tras ${ATTEMPTS} intentos`);
}

/**
 * Una cifra como el esquema la admite: decimal, sin exponente.
 *
 * El cuaderno del Banco Mundial escribe `…` o `..` donde no hay dato y FRED un
 * punto suelto; los tres son silencio del publicador y se saltan, no se
 * convierten en cero.
 */
export function plainNumber(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const text = raw.trim();
  const parsed = Number(text);
  if (text === '' || !Number.isFinite(parsed)) return null;
  /*
   * El cuaderno guarda flotantes binarios —`135.19999999999999` donde la hoja
   * muestra 135,2— y la forma más corta que vuelve al mismo número es la que
   * el publicador escribió. El extracto conserva la celda tal cual.
   */
  const shortest = /^-?\d+(?:\.\d+)?$/u.test(String(parsed)) ? String(parsed) : parsed.toFixed(6);
  return /^-?\d+(?:\.\d+)?$/u.test(shortest)
    ? shortest.replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '')
    : null;
}

/**
 * El mes en curso no se guarda: un promedio de medio mes baja o sube cada vez
 * que alguien lo consulta, y no es comparable con los meses cerrados.
 */
const closedMonth = (period: string): boolean =>
  period >= FIRST_MONTH && period < new Date().toISOString().slice(0, 7);

/**
 * La dirección del cuaderno mensual, leída de la página que lo enlaza.
 *
 * El archivo cambia de dirección con cada edición mensual —la ruta lleva un
 * identificador del documento— así que una dirección fija se queda en la
 * edición de enero de 2025 sin avisar. Se lee de la página cada vez.
 */
export async function worldBankWorkbook(): Promise<Download> {
  const page = (await download(WORLD_BANK_PAGE)).bytes.toString('utf-8');
  const link = /https?:\/\/[^"']*CMO-Historical-Data-Monthly\.xlsx/u.exec(page)?.[0];
  if (!link) throw new Error('la página del Banco Mundial ya no enlaza el cuaderno mensual');
  return download(link);
}

/** Todas las columnas del cuaderno, por el nombre que llevan en su cabecera. */
export function worldBankColumns(file: Download): Map<string, MonthlyPoint[]> {
  const rows = new Workbook(file.bytes).rows('Monthly Prices');
  const headerIndex = rows.findIndex((row) => row.get('B')?.trim() === 'Crude oil, average');
  const header = rows[headerIndex];
  const units = rows[headerIndex + 1];
  if (!header || !units) throw new Error('el cuaderno del Banco Mundial cambió de forma');

  const out = new Map<string, MonthlyPoint[]>();
  for (const row of rows.slice(headerIndex + 2)) {
    const label = row.get('A');
    const match = label ? /^(\d{4})M(\d{2})$/u.exec(label.trim()) : null;
    if (!label || !match) continue;
    const period = `${match[1]}-${match[2]}`;
    if (!closedMonth(period)) continue;
    for (const [column, name] of header) {
      if (column === 'A') continue;
      const value = plainNumber(row.get(column));
      if (value === null) continue;
      const key = name.trim();
      const own = out.get(key) ?? [];
      own.push({
        period,
        value,
        excerpt: `${label.trim()} | ${key} ${units.get(column) ?? ''} | ${row.get(column) ?? ''}`,
      });
      out.set(key, own);
    }
  }
  return out;
}

/** Una serie de FRED, promediada al mes por el propio servicio. */
export async function fredSeries(id: string): Promise<{ file: Download; points: MonthlyPoint[] }> {
  const file = await download(`${FRED_CSV}?id=${id}&fq=Monthly&fam=avg&cosd=${FIRST_MONTH}-01`);
  const points: MonthlyPoint[] = [];
  for (const line of file.bytes.toString('utf-8').split(/\r?\n/u)) {
    const match = /^(\d{4})-(\d{2})-01,(.*)$/u.exec(line.trim());
    if (!match) continue;
    const period = `${match[1]}-${match[2]}`;
    const value = plainNumber(match[3]);
    if (value === null || !closedMonth(period)) continue;
    points.push({ period, value, excerpt: line.trim() });
  }
  return { file, points };
}

interface FaoDatapoint {
  readonly date?: string;
  readonly price_value?: number | null;
  readonly periodicity?: string;
}

/**
 * Una serie de FAO/GIEWS. Sólo los puntos mensuales: algunos mercados traen
 * también la lectura semanal, que es otra medida y no se mezcla.
 */
export async function faoSeries(uuid: string): Promise<{ file: Download; points: MonthlyPoint[] }> {
  const file = await download(`${FAO_PRICES}/${uuid}/`);
  const parsed = JSON.parse(file.bytes.toString('utf-8')) as { datapoints?: FaoDatapoint[] };
  const points: MonthlyPoint[] = [];
  for (const datapoint of parsed.datapoints ?? []) {
    if (datapoint.periodicity !== 'monthly' || !datapoint.date) continue;
    const period = datapoint.date.slice(0, 7);
    const value = plainNumber(
      datapoint.price_value === null || datapoint.price_value === undefined
        ? undefined
        : String(datapoint.price_value),
    );
    if (value === null || !closedMonth(period)) continue;
    points.push({
      period,
      value,
      excerpt: JSON.stringify({ date: datapoint.date, price_value: datapoint.price_value }),
    });
  }
  points.sort((left, right) => left.period.localeCompare(right.period));
  return { file, points };
}
