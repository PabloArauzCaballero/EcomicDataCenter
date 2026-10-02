import { Workbook, type SheetRow } from '../macro/xlsx-cells';
import {
  describe,
  download,
  fail,
  monthDate,
  plainValue,
  writeFamily,
  type AccountSeries,
} from './public-accounts-seed';

/**
 * Cuánto ingresa y cuánto gasta el Estado, mes a mes.
 *
 * El Ministerio de Economía y Finanzas Públicas publica un cuaderno por año con las
 * «operaciones consolidadas» del sector público no financiero: ingresos (tributarios,
 * impuestos sobre hidrocarburos, venta de hidrocarburos, otras empresas), egresos
 * (servicios personales, bienes y servicios, intereses, transferencias, capital), el
 * resultado corriente y global y cómo se financió. Cada cuaderno trae tres hojas: el
 * sector público no financiero (SPNF) completo, el gobierno general y las empresas públicas.
 *
 * Los enlaces cambian con cada edición (`2026-09/SPNFGOBEMP2026-WEB_07.xlsx`), así que se
 * buscan en la página del Ministerio. Las hojas se toman por su ORDEN y no por su nombre,
 * porque el nombre cambió seis veces entre 2017 y 2026 (`SPNF`, `SPNF_BCB`, `SPNF_Web`…).
 *
 * Las etiquetas de fila se repiten: «TRANSFERENCIAS CORRIENTES» es un ingreso arriba y un
 * gasto abajo. Se distingue por el bloque en que cae, que cambia en «EGRESOS TOTALES».
 *
 * Antes de escribir nada se comprueba que las cuentas cierran —ingresos menos egresos es el
 * resultado global; corrientes más capital son el total—, porque una fila corrida un renglón
 * se ve igual de bien en un gráfico y es un error de miles de millones.
 *
 * Se ejecuta con `yarn fiscal:spnf`.
 */

const FAMILY = 'spnf';
const LISTING = 'https://www.economiayfinanzas.gob.bo/ejecucion-sector-publico-no-financiero';
const FIRST_YEAR = 2018;

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

const PERIMETERS = [
  { code: 'SPNF', label: 'Sector público no financiero' },
  { code: 'GG', label: 'Gobierno general' },
  { code: 'EMP', label: 'Empresas públicas' },
] as const;

type Block = 'ingreso' | 'gasto' | 'resultado';

interface Concept {
  readonly label: string;
  readonly block: Block;
  /** Cuando la etiqueta se repite entre bloques, el bloque en que cuenta. */
  readonly in: Block | 'any';
  readonly code: string;
  readonly name: string;
  readonly topic: 'ingreso' | 'gasto' | 'resultado' | 'financiamiento';
}

const CONCEPTS: readonly Concept[] = [
  { label: 'INGRESOS TOTALES', block: 'ingreso', in: 'any', code: 'INGRESOS_TOTALES', name: 'Ingresos totales', topic: 'ingreso' },
  { label: 'INGRESOS CORRIENTES', block: 'ingreso', in: 'any', code: 'INGRESOS_CORRIENTES', name: 'Ingresos corrientes', topic: 'ingreso' },
  { label: 'INGRESOS TRIBUTARIOS', block: 'ingreso', in: 'any', code: 'INGRESOS_TRIBUTARIOS', name: 'Ingresos tributarios', topic: 'ingreso' },
  { label: 'IMPUESTOS S/ HIDROCARBUROS', block: 'ingreso', in: 'any', code: 'IMPUESTOS_HIDROCARBUROS', name: 'Impuestos sobre hidrocarburos (IDH, regalías, IEHD)', topic: 'ingreso' },
  { label: 'HIDROCARBUROS', block: 'ingreso', in: 'any', code: 'VENTA_HIDROCARBUROS', name: 'Venta de hidrocarburos', topic: 'ingreso' },
  { label: 'OTRAS EMPRESAS', block: 'ingreso', in: 'any', code: 'OTRAS_EMPRESAS', name: 'Ingresos de otras empresas públicas', topic: 'ingreso' },
  { label: 'TRANSFERENCIAS CORRIENTES', block: 'ingreso', in: 'ingreso', code: 'TRANSFERENCIAS_RECIBIDAS', name: 'Transferencias corrientes recibidas', topic: 'ingreso' },
  { label: 'OTROS INGRESOS CORRIENTES', block: 'ingreso', in: 'any', code: 'OTROS_INGRESOS_CORRIENTES', name: 'Otros ingresos corrientes', topic: 'ingreso' },
  { label: 'INGRESOS DE CAPITAL', block: 'ingreso', in: 'any', code: 'INGRESOS_CAPITAL', name: 'Ingresos de capital', topic: 'ingreso' },
  { label: 'EGRESOS TOTALES', block: 'gasto', in: 'any', code: 'EGRESOS_TOTALES', name: 'Egresos totales', topic: 'gasto' },
  { label: 'EGRESOS CORRIENTES', block: 'gasto', in: 'any', code: 'EGRESOS_CORRIENTES', name: 'Egresos corrientes', topic: 'gasto' },
  { label: 'SERVICIOS PERSONALES', block: 'gasto', in: 'any', code: 'SERVICIOS_PERSONALES', name: 'Servicios personales (sueldos y salarios)', topic: 'gasto' },
  { label: 'BIENES Y SERVICIOS', block: 'gasto', in: 'any', code: 'BIENES_SERVICIOS', name: 'Bienes y servicios', topic: 'gasto' },
  { label: 'INTERESES DEUDA EXTERNA', block: 'gasto', in: 'any', code: 'INTERESES_EXTERNOS', name: 'Intereses de la deuda externa', topic: 'gasto' },
  { label: 'INTERESES DEUDA INTERNA', block: 'gasto', in: 'any', code: 'INTERESES_INTERNOS', name: 'Intereses de la deuda interna', topic: 'gasto' },
  { label: 'TRANSFERENCIAS CORRIENTES', block: 'gasto', in: 'gasto', code: 'TRANSFERENCIAS_CORRIENTES', name: 'Transferencias corrientes (subvenciones y otras)', topic: 'gasto' },
  { label: 'OTROS EGRESOS CORRIENTES', block: 'gasto', in: 'any', code: 'OTROS_EGRESOS_CORRIENTES', name: 'Otros egresos corrientes', topic: 'gasto' },
  { label: 'GASTOS NO IDENTIFICADOS', block: 'gasto', in: 'any', code: 'GASTOS_NO_IDENTIFICADOS', name: 'Gastos no identificados', topic: 'gasto' },
  { label: 'EGRESOS DE CAPITAL', block: 'gasto', in: 'any', code: 'EGRESOS_CAPITAL', name: 'Egresos de capital (inversión)', topic: 'gasto' },
  { label: 'SUP (DEF) CORRIENTE', block: 'resultado', in: 'any', code: 'RESULTADO_CORRIENTE', name: 'Superávit (déficit) corriente', topic: 'resultado' },
  { label: 'SUP (DEF) GLOBAL', block: 'resultado', in: 'any', code: 'RESULTADO_GLOBAL', name: 'Superávit (déficit) global', topic: 'resultado' },
  { label: 'CREDITO EXTERNO NETO', block: 'resultado', in: 'any', code: 'FINANCIAMIENTO_EXTERNO', name: 'Financiamiento: crédito externo neto', topic: 'financiamiento' },
  { label: 'CREDITO INTERNO NETO', block: 'resultado', in: 'any', code: 'FINANCIAMIENTO_INTERNO', name: 'Financiamiento: crédito interno neto', topic: 'financiamiento' },
];

const normalise = (text: string): string => text.replace(/\s+/gu, ' ').trim().toUpperCase();

interface Listed {
  readonly year: number;
  readonly url: string;
}

async function listWorkbooks(): Promise<Listed[]> {
  const page = (await download(LISTING)).bytes.toString('utf-8');
  const found = new Map<number, string>();
  for (const match of page.matchAll(/href="([^"]+SPNFGOBEMP(20\d{2})[^"]*\.xlsx)"/giu)) {
    const year = Number(match[2]);
    if (year >= FIRST_YEAR) found.set(year, new URL(match[1] as string, LISTING).toString());
  }
  if (found.size === 0) throw new Error('la pagina del Ministerio ya no enlaza los cuadernos SPNF');
  return [...found.entries()].map(([year, url]) => ({ year, url })).sort((a, b) => a.year - b.year);
}

/** Las columnas de cada mes: la fila de encabezado es la que dice ENE en la columna B. */
function monthColumns(rows: readonly SheetRow[]): { header: number; columns: Map<string, number> } {
  const header = rows.findIndex((row) => normalise(row.get('B') ?? '') === 'ENE');
  if (header < 0) throw new Error('no se encontro la fila de meses (ENE)');
  const columns = new Map<string, number>();
  for (const [column, text] of rows[header]?.entries() ?? []) {
    const month = MONTHS.indexOf(normalise(text));
    if (month >= 0) columns.set(column, month + 1);
  }
  if (columns.size < 1) throw new Error('la fila de meses no tiene meses');
  return { header, columns };
}

interface Reading {
  readonly concept: Concept;
  readonly row: number;
  readonly months: Map<number, string>;
}

function readSheet(rows: readonly SheetRow[]): Reading[] {
  const { header, columns } = monthColumns(rows);
  const readings: Reading[] = [];
  const seen = new Set<string>();
  let block: Block = 'ingreso';
  rows.forEach((row, index) => {
    if (index <= header) return;
    const label = normalise(row.get('A') ?? '');
    if (!label) return;
    if (label === 'EGRESOS TOTALES') block = 'gasto';
    if (label === 'SUP (DEF) CORRIENTE') block = 'resultado';
    const concept = CONCEPTS.find(
      (entry) => entry.label === label && (entry.in === 'any' || entry.in === block),
    );
    if (!concept || seen.has(concept.code)) return;
    seen.add(concept.code);
    const months = new Map<number, string>();
    for (const [column, month] of columns) {
      const value = plainValue(row.get(column));
      if (value !== null) months.set(month, value);
    }
    readings.push({ concept, row: index + 1, months });
  });
  return readings;
}

const number = (readings: readonly Reading[], code: string, month: number): number | null => {
  const value = readings.find((reading) => reading.concept.code === code)?.months.get(month);
  return value === undefined ? null : Number(value);
};

/** Que las cuentas cierren, mes a mes, con una tolerancia de redondeo. */
function reconcile(label: string, readings: readonly Reading[]): string[] {
  const problems: string[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const total = number(readings, 'INGRESOS_TOTALES', month);
    const spent = number(readings, 'EGRESOS_TOTALES', month);
    const global = number(readings, 'RESULTADO_GLOBAL', month);
    if (total === null || spent === null || global === null) continue;
    if (Math.abs(total - spent - global) > 1) {
      problems.push(`${label} mes ${month}: ingresos ${total.toFixed(1)} - egresos ${spent.toFixed(1)} != resultado ${global.toFixed(1)}`);
    }
    const current = number(readings, 'INGRESOS_CORRIENTES', month);
    const capital = number(readings, 'INGRESOS_CAPITAL', month);
    if (current !== null && capital !== null && Math.abs(current + capital - total) > 1) {
      problems.push(`${label} mes ${month}: ingresos corrientes + capital != totales`);
    }
  }
  return problems;
}

async function main(): Promise<void> {
  const workbooks = await listWorkbooks();
  const bySeries = new Map<string, AccountSeries & { points: Array<readonly [string, string]> }>();
  const problems: string[] = [];

  for (const { year, url } of workbooks) {
    const file = await download(url);
    const book = new Workbook(file.bytes);
    const sheets = book.sheetNames();
    for (const [position, perimeter] of PERIMETERS.entries()) {
      const sheet = sheets[position];
      if (!sheet) throw new Error(`${year}: falta la hoja ${position + 1} (${perimeter.label})`);
      const readings = readSheet(book.rows(sheet));
      problems.push(...reconcile(`${year} ${perimeter.code}`, readings));
      for (const reading of readings) {
        const code = `FISC_SPNF_${perimeter.code}_${reading.concept.code}_MM_BOB`;
        let series = bySeries.get(code);
        if (!series) {
          series = {
            indicatorCode: code,
            name: `${reading.concept.name} · ${perimeter.label} (millones de Bs, mensual)`,
            family: FAMILY,
            topic: reading.concept.topic,
            place: 'BOL',
            concept: reading.concept.code,
            perimeter: perimeter.code,
            unit: 'MM_BOB',
            frequency: 'MONTHLY',
            publisher: 'Ministerio de Economía y Finanzas Públicas',
            locator: { orientation: 'rows', sheet, row: reading.row, year },
            sourceUrl: url,
            // Una serie nace de varios cuadernos; la huella y la dirección son las del último.
            upstreamSha256: file.sha256,
            retrievedAt: file.retrievedAt,
            points: [],
          };
          bySeries.set(code, series);
        }
        series.points.push(
          ...[...reading.months.entries()]
            .sort(([left], [right]) => left - right)
            .map(([month, value]) => [monthDate(year, month), value] as const),
        );
        // El cuaderno del año en curso es el último que se lee: su enlace queda como fuente.
        Object.assign(series, {
          sourceUrl: url,
          upstreamSha256: file.sha256,
          retrievedAt: file.retrievedAt,
          locator: { orientation: 'rows', sheet, row: reading.row, year },
        });
      }
    }
    console.log(`  ${year}: ${url}`);
  }

  if (problems.length) {
    console.log(`\n${problems.length} cuentas que no cierran (se listan las primeras 15):`);
    for (const line of problems.slice(0, 15)) console.log(`  ${line}`);
  }

  const series = [...bySeries.values()]
    .map((one) => ({ ...one, points: one.points.sort((a, b) => a[0].localeCompare(b[0])) }))
    .filter((one) => one.points.length >= 2);
  const path = writeFamily(FAMILY, series);
  for (const one of series.filter((entry) => entry.perimeter === 'SPNF')) console.log(describe(one));
  console.log(`  -> ${series.length} series en ${path}`);
}

main().catch(fail);
