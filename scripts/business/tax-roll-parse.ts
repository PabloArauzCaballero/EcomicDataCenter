import type { Glyph, PdfRow } from './pdf-rows';
import { DEPARTMENTS } from './business-common';
import { columnCuts, columnOf, folded, isFigure, joinGlyphs, printedFigure } from './tax-geometry';

/**
 * El cuadro de características del padrón y la recaudación, leído por posición.
 *
 * Desde 2015 cada memoria trae un cuadro de dos columnas —participación en el
 * padrón y en la recaudación— abierto por bloques: categoría, tipo de persona,
 * departamento, once actividades y el detalle de las actividades que más
 * recaudan. Los rótulos de bloque se imprimen centrados en vertical a la
 * izquierda, a veces en la misma línea que una fila; no sirven para cortar. Lo
 * que corta es el contenido, que no cambia: la categoría son PRICO, GRACO,
 * Resto y regímenes especiales; después vienen los tipos de persona, los nueve
 * departamentos, y dos bloques de actividad que terminan, cada uno, en
 * «Regímenes especiales». Lo que sigue (grupos de impuestos, cifras anuales) no
 * es una apertura del padrón y se deja; sólo se lee la fila del total.
 *
 * 2013 y 2014 traen otro cuadro, sólo por categoría pero con cantidades: el
 * mismo recorrido lo lee con cuatro columnas en vez de dos.
 */

export type RollBlock = 'CAT' | 'PERSON' | 'DEPT' | 'ACT' | 'ACTD' | 'TOTAL';
export type RollColumn = 'count' | 'rollPct' | 'revenue' | 'revenuePct';

/** Una fila del cuadro con sus celdas por nombre de columna. */
export interface RollRow {
  readonly block: RollBlock;
  readonly label: string;
  readonly cells: Partial<Record<RollColumn, string>>;
  readonly page: number;
}

/**
 * Un tramo del cuadro: una página, o la parte de una página entre dos `x`.
 *
 * 2019 reparte el cuadro en tres tramos —abajo a la izquierda de una página, la
 * columna derecha de esa misma página y el pie en la siguiente— con texto
 * corrido entre medio; cada tramo se lee aparte y en el orden declarado.
 */
export interface RollSegment {
  readonly page: number;
  readonly band?: readonly [number, number];
}

const DEPARTMENT_NAMES = new Set(Object.values(DEPARTMENTS).map(folded));
const isSpecial = (label: string): boolean => /^REGIMENES ESPECIALES$/u.test(folded(label));
const isPerson = (label: string): boolean => /PERSONA|UNIPERSONAL|SUCESION/u.test(folded(label));
const isTotal = (label: string): boolean => /^TOTAL\b/u.test(folded(label));
/** Las subdivisiones de los regímenes especiales que 2013 y 2014 abren: no son hermanas de PRICO. */
const isRegimeDetail = (label: string): boolean => /^(RTS|RAU|STI)$/u.test(folded(label));
const isOpening = (label: string): boolean =>
  /(?:^|[ /])PRICO$|^REGIMEN GENERAL$/u.test(folded(label));

/** Un rótulo que sigue en el renglón de abajo: termina en conector o el siguiente empieza con uno. */
const CONNECTOR = /(?:^|\s)(?:DE|DEL|Y|E|O|U|EN|A|LA|LAS|LOS|POR|PARA|CON)$|[,;:(-]$/u;
const continues = (above: string, below: string): boolean =>
  CONNECTOR.test(folded(above)) ||
  /^[a-záéíóúñ(]/u.test(below) ||
  // «La», «Las», «A» no: «La Paz» empieza así y es una fila nueva.
  /^(?:DE|DEL|Y|E|O|U|EN|POR|PARA|CON)\s/u.test(folded(below));

/** Las cifras con que termina una línea, si alguna tiene separador o por ciento. */
function trailing(glyphs: readonly Glyph[]): Glyph[] {
  const run: Glyph[] = [];
  for (const glyph of [...glyphs].reverse()) {
    if (!isFigure(glyph.text)) break;
    run.unshift(glyph);
  }
  return run.some((glyph) => /[.,%]/u.test(glyph.text)) ? run : [];
}

/** Una línea del tramo: su rótulo (si trae) y sus cifras (si trae). */
interface Line {
  readonly y: number;
  readonly page: number;
  readonly label: string;
  readonly figures: Glyph[];
}

/** Dónde empiezan los rótulos de fila en un tramo: lo más repetido entre las filas con cifras. */
function labelColumn(rows: readonly PdfRow[]): number {
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (trailing(row.glyphs).length === 0) continue;
    const first = row.glyphs.find((glyph) => !isFigure(glyph.text));
    if (first) counts.set(Math.round(first.x), (counts.get(Math.round(first.x)) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 0;
}

/**
 * Las líneas de un tramo, con los rótulos partidos ya unidos a su fila.
 *
 * Un rótulo largo ocupa dos o tres renglones y sus cifras caen en uno de ellos
 * —el del medio, el último, o uno propio entre los dos—, según la edición. La
 * altura sola no alcanza para decidir de qué fila es un renglón suelto: en 2020
 * el último renglón de un rótulo queda más cerca de la fila siguiente que de la
 * suya. Lo que sí decide es el texto: un renglón que termina en «de», «y» o una
 * coma sigue abajo, y uno que empieza en minúscula o con un conector viene de
 * arriba. Así se arman los rótulos; después cada rótulo se le da a la fila con
 * cifras que cae dentro de su altura, o a la más cercana.
 */
function linesOf(rows: readonly PdfRow[]): Line[] {
  const label = labelColumn(rows);
  const raw = [...rows]
    .sort((left, right) => right.y - left.y)
    .map((row) => {
      const figures = trailing(row.glyphs);
      const words = row.glyphs.filter((glyph) => !figures.includes(glyph) && glyph.x >= label - 3);
      const fallback = row.glyphs.filter((glyph) => !figures.includes(glyph));
      // La fila del total va centrada, a veces a la izquierda de los rótulos.
      const text = joinGlyphs(words.length > 0 || figures.length === 0 ? words : fallback);
      return { y: row.y, page: row.page, text: text.replace(/\uFFFD/gu, '.'), figures };
    })
    .filter((line) => line.text || line.figures.length > 0);
  const blocks: { texts: { y: number; text: string }[]; figured: typeof raw }[] = [];
  for (const line of raw) {
    const last = blocks.at(-1);
    const previous = last?.texts.at(-1);
    const joins = last && previous && line.text && continues(previous.text, line.text);
    if (last && (joins || (!line.text && last.figured.length === 0))) {
      if (line.text) last.texts.push({ y: line.y, text: line.text });
      if (line.figures.length > 0) last.figured.push(line);
      continue;
    }
    blocks.push({
      texts: line.text ? [{ y: line.y, text: line.text }] : [],
      figured: line.figures.length > 0 ? [line] : [],
    });
  }
  return settle(blocks);
}

/** Cada bloque de rótulo con su fila de cifras; los rótulos sin cifras se cuelgan de la más cercana. */
function settle(
  blocks: {
    texts: { y: number; text: string }[];
    figured: { y: number; page: number; figures: Glyph[] }[];
  }[],
): Line[] {
  const out: Line[] = [];
  const orphans: { y: number; text: string }[] = [];
  for (const block of blocks) {
    const figured = block.figured[0];
    if (!figured) {
      orphans.push(...block.texts);
      continue;
    }
    out.push({
      y: figured.y,
      page: figured.page,
      label: block.texts.map((one) => one.text).join(' '),
      figures: figured.figures,
    });
  }
  for (const orphan of orphans) {
    const nearest = [...out].sort(
      (left, right) => Math.abs(left.y - orphan.y) - Math.abs(right.y - orphan.y),
    )[0];
    if (nearest && Math.abs(nearest.y - orphan.y) < 12 && !nearest.label) {
      out[out.indexOf(nearest)] = { ...nearest, label: orphan.text };
    }
  }
  return out.sort((left, right) => right.y - left.y);
}

/**
 * Las filas del cuadro en su bloque, desde la primera fila con cifras hasta el
 * total. `columns` dice qué es cada columna de cifras, de izquierda a derecha.
 */
export function readRollTable(
  segments: readonly (readonly PdfRow[])[],
  columns: readonly RollColumn[],
  where: string,
): RollRow[] {
  const lines = segments.flatMap((rows) => {
    const own = linesOf(rows);
    const body = own.filter((line) => !isTotal(line.label));
    // La fila del total no se usa para cortar: en 2024 su cuenta va centrada
    // lejos de la columna del padrón. Se lee por orden.
    const figures = body.flatMap((line) => line.figures);
    const cuts =
      figures.length > 0 ? columnCuts(figures, columns.length, `${where} p. ${rows[0]?.page}`) : [];
    return own.map((line) => ({ ...line, cuts }));
  });
  const first = lines.findIndex((line) => isOpening(line.label));
  const start =
    first >= 0 ? first : lines.findIndex((line) => DEPARTMENT_NAMES.has(folded(line.label)));
  if (start < 0) throw new Error(`${where}: no se encuentra el comienzo del cuadro del padrón`);
  return walk(lines.slice(start), columns);
}

/** Recorre las filas en orden y le pone a cada una su bloque. */
function walk(
  lines: readonly (Line & { cuts: number[] })[],
  columns: readonly RollColumn[],
): RollRow[] {
  const out: RollRow[] = [];
  let block: RollBlock | 'SKIP' = 'CAT';
  for (const line of lines) {
    const label = line.label;
    if (isTotal(label)) block = 'TOTAL';
    else if (block === 'CAT' && isPerson(label)) block = 'PERSON';
    else if ((block === 'CAT' || block === 'PERSON') && DEPARTMENT_NAMES.has(folded(label)))
      block = 'DEPT';
    else if (block === 'DEPT' && !DEPARTMENT_NAMES.has(folded(label))) block = 'ACT';
    const cells: Partial<Record<RollColumn, string>> = {};
    line.figures.forEach((glyph, index) => {
      const column = block === 'TOTAL' ? columns[index] : columns[columnOf(glyph, line.cuts)];
      if (column) cells[column] = printedFigure(`${cells[column] ?? ''}${glyph.text}`);
    });
    if (block !== 'SKIP' && !isRegimeDetail(label))
      out.push({ block, label, cells, page: line.page });
    if (block === 'TOTAL') return out;
    // Cada bloque de actividad cierra con los regímenes especiales; lo que
    // viene después del segundo ya no es una apertura del padrón.
    if (block === 'ACT' && isSpecial(label)) block = 'ACTD';
    else if (block === 'ACTD' && isSpecial(label)) block = 'SKIP';
  }
  throw new Error('el cuadro del padrón no llega a su total');
}
