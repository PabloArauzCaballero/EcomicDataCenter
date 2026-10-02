import type { Glyph, PdfRow } from './pdf-rows';
import { departmentKey, formKey, plain } from './registry-flow-keys';
import type { FlowTable } from './registry-flow-sources';

/**
 * Lee un cuadro de los reportes de FUNDEMPRESA por la posición de sus cifras.
 *
 * Todos los cuadros de flujo del registro tienen la misma anatomía —un título
 * «Bolivia: <qué> según <dimensión>», una cabecera, una fila por categoría y un
 * TOTAL—, pero la cabecera cambia de forma: años en columnas («2016 … 2021»),
 * una sola columna de cantidad junto a su porcentaje, o las abreviaturas de los
 * departamentos en un cuadro cruzado. Las cifras se atan a su columna por la
 * `x` de la cabecera, nunca por el orden en que aparecen: una celda vacía
 * correría todas las cifras de la fila una columna a la izquierda.
 *
 * Cada cuadro se comprueba contra sí mismo antes de entregar una sola cifra:
 * las filas tienen que ser las que la fuente declara y sumar el TOTAL que el
 * propio cuadro imprime, columna por columna. Si no suman, la lectura está mal
 * y la corrida se detiene diciendo qué cuadro de qué reporte.
 */

/** Una celda leída: a qué fila y columna pertenece y la fila tal como se imprimió. */
export interface TableCell {
  readonly rowKey: string;
  readonly columnKey: string;
  readonly value: string;
  readonly excerpt: string;
}

const YEAR = /^(?:19|20)\d{2}(?:\(\d\))?$/u;
const COUNT = /^-?\d{1,3}(?:[.,]\d{3})+$|^-?\d+$/u;
const centre = (glyph: Glyph): number => (glyph.x + glyph.right) / 2;
/** La cifra sin separador de miles: los cuadros de cantidades no tienen decimales. */
const integer = (printed: string): string => printed.replace(/[.,]/gu, '');

interface Column {
  readonly key: string;
  readonly x: number;
}

/** La fila del título y, si el título sigue en la línea de abajo, las dos juntas. */
function findTitle(rows: readonly PdfRow[], table: FlowTable, where: string): number {
  const found = rows.findIndex((row, index) => {
    const next = rows[index + 1];
    const joined = next && next.page === row.page ? `${row.text} ${next.text}` : row.text;
    return /Bolivia\s*:/u.test(row.text) && table.title.test(joined);
  });
  if (found < 0) throw new Error(`${where}: no aparece el cuadro «${table.title.source}»`);
  return found;
}

/** Las columnas de años: la primera aparición de cada año, para saltar el bloque de porcentajes. */
function yearColumns(row: PdfRow): Column[] {
  const columns: Column[] = [];
  for (const glyph of row.glyphs) {
    const year = glyph.text.slice(0, 4);
    if (YEAR.test(glyph.text) && !columns.some((column) => column.key === year)) {
      columns.push({ key: year, x: centre(glyph) });
    }
  }
  return columns;
}

/** Las columnas de un cuadro cruzado por departamento, con su TOTAL al final. */
function departmentColumns(row: PdfRow): Column[] {
  return row.glyphs.flatMap((glyph) => {
    const key = plain(glyph.text) === 'TOTAL' ? 'TOTAL' : departmentKey(glyph.text);
    return key ? [{ key, x: centre(glyph) }] : [];
  });
}

interface Head {
  readonly index: number;
  readonly columns: readonly Column[];
  /** Desde qué `x` una cifra es dato y no el número de una subfila («G 1») a la izquierda. */
  readonly minX: number;
  /**
   * Hasta qué fracción de la distancia entre columnas puede caer una cifra de su
   * cabecera. En los cuadros por año va justo a la mitad, porque a la derecha
   * vienen las columnas de crecimiento y porcentaje sin año encima; en los
   * cruzados no hay nada más y las cifras alineadas a la derecha se alejan más
   * de la abreviatura centrada.
   */
  readonly reach: number;
}

/** La cabecera: la primera fila bajo el título que tiene las columnas que el cuadro declara. */
function header(rows: readonly PdfRow[], from: number, table: FlowTable): Head | undefined {
  for (let index = from + 1; index < Math.min(rows.length, from + 14); index += 1) {
    const row = rows[index];
    if (!row || row.page !== rows[from]?.page) break;
    if (row.glyphs.some((glyph) => /^[–-]$/u.test(glyph.text))) continue;
    if (row.glyphs.some((glyph) => COUNT.test(glyph.text) && !YEAR.test(glyph.text))) continue;
    if (table.columns === 'single') {
      const amount = row.glyphs.find((glyph) => /^CANTIDAD/u.test(plain(glyph.text)));
      if (amount) return { index, columns: [], minX: amount.x - 40, reach: 0 };
      continue;
    }
    const columns = table.columns === 'years' ? yearColumns(row) : departmentColumns(row);
    const enough = table.columns === 'years' ? columns.length >= 2 : columns.length === 10;
    const reach = table.columns === 'years' ? 0.5 : 0.8;
    if (enough) return { index, columns, minX: Math.min(...columns.map((c) => c.x)) - 25, reach };
  }
  return undefined;
}

/** La clave de la fila según la dimensión del cuadro, o nada si es una subfila. */
function rowKey(label: readonly Glyph[], dimension: string): string | undefined {
  const text = label.map((glyph) => glyph.text).join(' ');
  if (dimension === 'DEPT') return departmentKey(text);
  if (dimension === 'FORM') return formKey(text);
  // La sección es la primera letra; «G 1», «G 2» y «G 3» son las ramas de G y no se cuentan.
  const first = label[0]?.text ?? '';
  const second = label[1]?.text ?? '';
  if (/^\d/u.test(second) || /^[A-Z]\d/u.test(first)) return undefined;
  const letter = /^([A-Z])(?:\(\*\))?$/u.exec(first)?.[1];
  if (letter) return letter;
  if (/NO DECLARADA|SIN ACTIVIDAD/u.test(plain(text))) return 'X';
  return undefined;
}

/** Las cifras de una fila, cada una en la columna cuya cabecera tiene más cerca. */
function placeCounts(row: PdfRow, head: Head, where: string): Map<string, string> {
  const placed = new Map<string, string>();
  const { columns } = head;
  const counts = row.glyphs.filter((glyph) => COUNT.test(glyph.text) && centre(glyph) >= head.minX);
  if (columns.length === 0) {
    const first = counts[0];
    if (first) placed.set('SINGLE', integer(first.text));
    return placed;
  }
  const spacing = Math.min(
    ...columns.slice(1).map((column, index) => column.x - (columns[index]?.x ?? 0)),
    60,
  );
  for (const glyph of counts) {
    const nearest = [...columns].sort(
      (left, right) => Math.abs(left.x - centre(glyph)) - Math.abs(right.x - centre(glyph)),
    )[0];
    if (!nearest || Math.abs(nearest.x - centre(glyph)) > spacing * head.reach) continue;
    if (placed.has(nearest.key)) throw new Error(`${where}: dos cifras en ${nearest.key}: «${row.text}»`);
    placed.set(nearest.key, integer(glyph.text));
  }
  return placed;
}

/** Comprueba que las filas sumen el TOTAL impreso, columna por columna. */
function checkTotals(
  cells: readonly TableCell[],
  total: Map<string, string>,
  where: string,
): void {
  for (const [column, printed] of total) {
    const sum = cells
      .filter((cell) => cell.columnKey === column)
      .reduce((acc, cell) => acc + Number(cell.value), 0);
    if (sum !== Number(printed)) {
      throw new Error(`${where}: la columna ${column} suma ${sum} y el cuadro dice ${printed}`);
    }
  }
}

/** En un cuadro cruzado, los nueve departamentos de una fila suman su TOTAL. */
function checkRow(placed: Map<string, string>, where: string): void {
  let sum = 0;
  for (const [column, value] of placed) if (column !== 'TOTAL') sum += Number(value);
  if (placed.size !== 10 || String(sum) !== placed.get('TOTAL')) {
    throw new Error(`${where}: ${placed.size} celdas que suman ${sum} y el TOTAL dice ${placed.get('TOTAL')}`);
  }
}

/**
 * Todas las celdas de un cuadro, ya comprobadas contra su TOTAL, y la fila TOTAL
 * misma con la clave BOLIVIA: es el total nacional del flujo.
 */
export function readTable(rows: readonly PdfRow[], table: FlowTable, where: string): TableCell[] {
  const at = `${where} · ${table.title.source}`;
  const titleIndex = findTitle(rows, table, where);
  const head = header(rows, titleIndex, table);
  if (!head) throw new Error(`${at}: no se encontró la cabecera`);
  const headIndex = head.index;
  const title = rows[titleIndex]?.text ?? '';
  const headText = rows[headIndex]?.text ?? '';
  const cells: TableCell[] = [];
  const keys = new Set<string>();
  for (let index = headIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || row.page !== rows[headIndex]?.page) break;
    const firstCount = row.glyphs.findIndex(
      (glyph) => COUNT.test(glyph.text) && centre(glyph) >= head.minX,
    );
    if (firstCount < 0) continue;
    const label = row.glyphs.slice(0, firstCount);
    const placed = placeCounts(row, head, at);
    if (/^TOTAL/u.test(plain(label.map((glyph) => glyph.text).join(' ')))) {
      if (keys.size !== table.rows) {
        throw new Error(`${at}: ${keys.size} filas y el cuadro debe dar ${table.rows}`);
      }
      checkTotals(cells, placed, at);
      const excerpt = `${title} | ${headText} | ${row.text}`;
      const totals = [...placed].map(([columnKey, value]) => ({ rowKey: 'BOLIVIA', columnKey, value, excerpt }));
      return [...cells, ...totals];
    }
    const key = rowKey(label, table.dimension);
    if (!key) continue;
    if (keys.has(key)) throw new Error(`${at}: la fila ${key} aparece dos veces`);
    keys.add(key);
    if (table.columns === 'departments') checkRow(placed, `${at} · ${key}`);
    const excerpt = `${title} | ${headText} | ${row.text}`;
    for (const [columnKey, value] of placed) cells.push({ rowKey: key, columnKey, value, excerpt });
  }
  throw new Error(`${at}: el cuadro no cierra con una fila TOTAL`);
}
