import type { SheetRow } from '../macro/xlsx-cells';
import type { Flow, TradeCatalogue } from './trade-catalogue';

/**
 * Cómo se resume un registro aduanero del INE sin perder el detalle que importa.
 *
 * La base que publica el INE trae una fila por declaración agrupada: partida
 * NANDINA de diez dígitos, país, departamento, aduana, vía y medio de
 * transporte, con peso y valor. Guardarla tal cual serían cuatrocientas mil
 * filas por año de importaciones. Se agrega sobre las dimensiones que nadie
 * pidió (aduana, vía, medio) y se conserva todo lo demás:
 *
 * - **Exportaciones**: partida × país × departamento × mes × tipo de flujo
 *   (exportación, reexportación, efectos personales). Unas catorce mil filas por
 *   año: el detalle completo que publica el INE, sin la aduana.
 * - **Importaciones, detalle anual**: partida × país. Cuarenta y siete mil
 *   filas por año; con el mes serían ciento ochenta mil.
 * - **Importaciones, mensual**: uso o destino económico (CUODE) × capítulo ×
 *   departamento × mes. Contesta «qué entra cada mes y adónde» sin el país.
 *
 * Las cabeceras se leen por nombre y no por posición porque el INE las cambia
 * entre años (`CUCI3`/`CUCIR3`, `GCE3`/`GCE`, `KILOS`/`KILBRU`) y reordena las
 * columnas; una cabecera que falta detiene la corrida con su nombre.
 */

/** Los nombres que el INE usa para cada campo, en el orden en que se prueban. */
const ALIASES: Readonly<Record<string, readonly string[]>> = {
  month: ['MES'],
  kind: ['FLUJO'],
  nandina: ['NANDINA'],
  nandinaName: ['DESNAN'],
  chapter: ['CAP'],
  chapterName: ['DESCAP'],
  section: ['SECC'],
  sectionName: ['DESSEC'],
  country: ['PAIS'],
  countryName: ['DESPAIS', 'DESPAI'],
  zone: ['DESAREA', 'DESZON'],
  bloc: ['OTROS'],
  department: ['DEPART', 'DEPTO'],
  departmentName: ['DESDEP', 'DESDEPTO'],
  cuci: ['CUCI3', 'CUCIR3'],
  cuciName: ['DESCUCI3', 'DESCUCI'],
  gce: ['GCE3', 'GCE', 'GCER3'],
  gceName: ['DESGCE3', 'DESGCE'],
  ciiu: ['CIIUR3', 'CIIU3'],
  ciiuName: ['DESCIIU3', 'DESCIIU'],
  activityGroup: ['CLACT'],
  activity: ['CODACT2', 'CODACT'],
  activityName: ['DESACT2', 'DESACT'],
  tnt: ['TNT'],
  tntName: ['DESTNT'],
  tntClass: ['CLTNT'],
  use: ['CUODE'],
  useName: ['DESCUO'],
  netKg: ['KILNET'],
  grossKg: ['KILOS', 'KILBRU'],
  fineKg: ['FINO'],
  exportUsd: ['VALOR'],
  cifUsd: ['FRO'],
  fobUsd: ['FOB'],
};

const REQUIRED: Readonly<Record<Flow, readonly string[]>> = {
  X: ['month', 'kind', 'nandina', 'country', 'department', 'netKg', 'exportUsd'],
  M: ['month', 'nandina', 'country', 'department', 'use', 'grossKg', 'cifUsd', 'fobUsd'],
};

export type Columns = ReadonlyMap<string, string>;

/** Las letras de columna de cada campo, leídas de la fila de cabecera. */
export function columnsOf(header: SheetRow, flow: Flow, what: string): Columns {
  const byName = new Map<string, string>();
  for (const [letter, text] of header) byName.set(text.trim().toUpperCase(), letter);
  const columns = new Map<string, string>();
  for (const [field, names] of Object.entries(ALIASES)) {
    const letter = names.map((name) => byName.get(name)).find(Boolean);
    if (letter) columns.set(field, letter);
  }
  const missing = REQUIRED[flow].filter((field) => !columns.has(field));
  if (missing.length) {
    throw new Error(`${what}: faltan las columnas ${missing.join(', ')} en la cabecera`);
  }
  return columns;
}

const text = (row: SheetRow, columns: Columns, field: string): string => {
  const letter = columns.get(field);
  return letter ? (row.get(letter) ?? '').replace(/_x[0-9A-Fa-f]{4}_/gu, '').trim() : '';
};

const amount = (row: SheetRow, columns: Columns, field: string): number => {
  const parsed = Number(text(row, columns, field));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** El tipo de flujo de exportación: «1 EXPORTACIONES» → 1. */
const kindOf = (label: string): number => Number(/^\s*(\d)/u.exec(label)?.[1] ?? 1);

/** Suma varias medidas bajo una misma clave, sin crear objetos por fila. */
class Accumulator {
  private readonly sums = new Map<string, number[]>();
  constructor(private readonly width: number) {}

  add(key: string, values: readonly number[]): void {
    let slot = this.sums.get(key);
    if (!slot) {
      slot = new Array<number>(this.width).fill(0);
      this.sums.set(key, slot);
    }
    for (let index = 0; index < this.width; index += 1) slot[index]! += values[index] ?? 0;
  }

  entries(): IterableIterator<[string, number[]]> {
    return this.sums.entries();
  }
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** Una fila del cubo: las claves tal como se escriben, y las medidas redondeadas. */
export type CubeRow = ReadonlyArray<string | number>;

export interface YearCubes {
  readonly records: number;
  readonly months: number[];
  readonly totals: { usd: number; kg: number; fobUsd: number };
  /** X: mes, partida, país, departamento, tipo, US$ FOB, kg neto, kg fino. */
  readonly detail: CubeRow[];
  /** M: mes, CUODE, capítulo, departamento, US$ CIF, US$ FOB, kg bruto. Vacío en X. */
  readonly monthly: CubeRow[];
}

/** Lee un año entero de registros y lo devuelve agregado. */
export class YearReader {
  private columns: Columns | null = null;
  private records = 0;
  private readonly months = new Set<number>();
  private readonly totals = { usd: 0, kg: 0, fobUsd: 0 };
  private readonly detail = new Accumulator(3);
  private readonly monthly = new Accumulator(3);

  constructor(
    private readonly flow: Flow,
    private readonly what: string,
    private readonly catalogue: TradeCatalogue,
  ) {}

  /** Toma una fila: la cabecera fija las columnas; las demás se suman. */
  visit(row: SheetRow): void {
    if (!this.columns) {
      const isHeader = [...row.values()].some((cell) => cell.trim().toUpperCase() === 'NANDINA');
      if (isHeader) this.columns = columnsOf(row, this.flow, this.what);
      return;
    }
    const columns = this.columns;
    const nandina = text(row, columns, 'nandina');
    if (!/^\d{10}$/u.test(nandina)) return;
    const month = amount(row, columns, 'month');
    const country = text(row, columns, 'country');
    const department = text(row, columns, 'department');
    this.records += 1;
    this.months.add(month);
    this.catalogue.learn(this.flow, (field) => text(row, columns, field));

    if (this.flow === 'X') {
      const usd = amount(row, columns, 'exportUsd');
      const kg = amount(row, columns, 'netKg');
      const kind = kindOf(text(row, columns, 'kind'));
      this.totals.usd += usd;
      this.totals.kg += kg;
      this.detail.add(`${month}|${nandina}|${country}|${department}|${kind}`, [
        usd,
        kg,
        amount(row, columns, 'fineKg'),
      ]);
      return;
    }
    const cif = amount(row, columns, 'cifUsd');
    const fob = amount(row, columns, 'fobUsd');
    const kg = amount(row, columns, 'grossKg');
    this.totals.usd += cif;
    this.totals.fobUsd += fob;
    this.totals.kg += kg;
    this.detail.add(`${nandina}|${country}`, [cif, fob, kg]);
    const use = text(row, columns, 'use');
    this.monthly.add(`${month}|${use}|${nandina.slice(0, 2)}|${department}`, [cif, fob, kg]);
  }

  finish(): YearCubes {
    if (!this.columns) throw new Error(`${this.what}: ninguna hoja trae la cabecera NANDINA`);
    /*
     * Qué clave es número y cuál es texto, por posición. El capítulo y el CUODE
     * llevan ceros a la izquierda («07», «002») que un número borraría; el mes,
     * el país, el departamento y el tipo de flujo son códigos numéricos.
     */
    const shapes: Record<'X' | 'M' | 'MONTHLY', readonly boolean[]> = {
      X: [true, false, true, true, true],
      M: [false, true],
      MONTHLY: [true, false, false, true],
    };
    const typed = (key: string, numeric: readonly boolean[]): Array<string | number> =>
      key.split('|').map((part, index) => (numeric[index] && part !== '' ? Number(part) : part));
    const expand = (source: Accumulator, numeric: readonly boolean[]): CubeRow[] =>
      [...source.entries()]
        .map(([key, sums]) => [...typed(key, numeric), ...sums.map(round)])
        .sort((left, right) => String(left).localeCompare(String(right)));
    return {
      records: this.records,
      months: [...this.months].sort((left, right) => left - right),
      totals: {
        usd: round(this.totals.usd),
        kg: round(this.totals.kg),
        fobUsd: round(this.totals.fobUsd),
      },
      detail: expand(this.detail, shapes[this.flow]),
      monthly: this.flow === 'M' ? expand(this.monthly, shapes.MONTHLY) : [],
    };
  }
}
