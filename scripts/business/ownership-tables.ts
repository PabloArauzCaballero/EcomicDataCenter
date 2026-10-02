import type { Glyph, PdfRow } from './pdf-rows';

/**
 * El cuadro de accionistas de un documento, leído por la posición de cada trozo.
 *
 * Las fichas de la Bolsa, los prospectos que registra ASFI y las memorias de
 * los bancos imprimen el mismo cuadro con distinta maqueta: una columna con el
 * nombre del titular, alguna con el número de acciones y una con el porcentaje.
 * Pasado a texto corrido el cuadro se rompe —en el prospecto de 2015 del
 * Mercantil la columna del porcentaje queda corrida un renglón a partir de la
 * sexta fila y la suma sigue dando cien—, así que aquí no se lee texto: se
 * busca la cabecera, cada rótulo define el tramo de `x` de su columna y cada
 * fila se arma con lo que cae debajo de cada una.
 */

/** Una fila del cuadro tal como se imprime. */
export interface StakeLine {
  /** El titular, con los renglones partidos ya unidos. */
  readonly holder: string;
  /** El porcentaje como lo imprime el documento, «36,45%» o «51.0101%». */
  readonly printed: string;
  /** El mismo porcentaje como número, sólo para las comprobaciones. */
  readonly share: number;
  /** Las acciones o cuotas de la fila, cuando el cuadro las trae. */
  readonly units: number | undefined;
  /** El renglón, sólo con las columnas del cuadro: es el extracto. */
  readonly text: string;
}

export interface StakeTable {
  readonly lines: StakeLine[];
  /** El porcentaje de la fila de total, si el cuadro la imprime. */
  readonly total: number | undefined;
  readonly totalUnits: number | undefined;
  /** La cabecera, para citarla junto a la fila. */
  readonly header: string;
}

/** Cómo encontrar el cuadro en las páginas declaradas. */
export interface TableLayout {
  /** Un texto que está sobre el cuadro, cuando la página trae más de uno. */
  readonly anchor?: RegExp;
  /** Desde qué `x` empieza el nombre, si a la izquierda hay rótulos de adorno. */
  readonly holderFrom?: number;
  /** El hueco vertical, en puntos, que da el cuadro por terminado. */
  readonly maxGap?: number;
}

const HOLDER_HEADER = /accionista|nombre|raz[oó]n social|^socios?$/iu;
const SHARE_HEADER = /^%$|particip|porcentaje|%/iu;
const UNITS_HEADER = /^total$|acciones|ordinarias|cuotas/iu;
const PERCENT = /^\d{1,3}(?:[.,]\d{1,6}\s?%?|\s?%)$/u;
const NUMBER = /^\d{1,3}(?:[.,]\d{3})*$/u;
const TOTAL = /^total(?:es)?\b/iu;

const centre = (glyph: Glyph): number => (glyph.x + glyph.right) / 2;

/** «36,45%» → 36.45; «51.0101%» → 51.0101. */
export function percentOf(printed: string): number {
  return Number(printed.replace(/[%\s]/gu, '').replace(',', '.'));
}

const unitsOf = (printed: string): number => Number(printed.replace(/[.,]/gu, ''));

type Span = readonly [number, number];

interface Columns {
  readonly holder: Span;
  readonly share: Span;
  readonly units: Span | undefined;
}

/**
 * Los rótulos de la cabecera, con las palabras sueltas de un mismo rótulo
 * unidas: hay maquetas que escriben «NOMBRE O RAZÓN SOCIAL» como un trozo y
 * otras como cuatro, y en dos renglones («N. DE» sobre «ACCIONES»).
 */
function headerCells(lines: readonly PdfRow[], from: number): { text: string; x: number; right: number }[] {
  const glyphs = lines
    .flatMap((line) => line.glyphs)
    .filter((glyph) => glyph.x >= from)
    .sort((left, right) => left.x - right.x);
  const cells: { text: string; x: number; right: number }[] = [];
  for (const glyph of glyphs) {
    const last = cells.at(-1);
    if (last && glyph.x <= last.right + 5) {
      last.text = `${last.text} ${glyph.text}`;
      last.right = Math.max(last.right, glyph.right);
    } else {
      cells.push({ text: glyph.text, x: glyph.x, right: glyph.right });
    }
  }
  return cells;
}

/**
 * Cada columna va de la mitad del hueco con el rótulo anterior a la mitad del
 * hueco con el siguiente: las cifras van alineadas a la derecha y su `x` no
 * coincide con la del rótulo, pero nunca cruzan esa mitad.
 */
function columnsOf(header: readonly PdfRow[], layout: TableLayout): Columns | undefined {
  const cells = headerCells(header, layout.holderFrom ?? -Infinity);
  const mids = cells.map((cell) => (cell.x + cell.right) / 2);
  const span = (index: number): Span => [
    index > 0 ? ((mids[index - 1] ?? 0) + (mids[index] ?? 0)) / 2 : -Infinity,
    index < cells.length - 1 ? ((mids[index] ?? 0) + (mids[index + 1] ?? 0)) / 2 : Infinity,
  ];
  const holder = cells.findIndex((cell) => HOLDER_HEADER.test(cell.text));
  const share = cells.findIndex((cell, index) => index > holder && SHARE_HEADER.test(cell.text));
  if (holder < 0 || share < 0) return undefined;
  // Con acciones ordinarias y preferentes, la cuota es sobre la columna «Total».
  const unitsAt = (pattern: RegExp): number =>
    cells.findIndex((cell, index) => index > holder && index !== share && pattern.test(cell.text.trim()));
  const units = unitsAt(/^total$/iu) >= 0 ? unitsAt(/^total$/iu) : unitsAt(UNITS_HEADER);
  const holderSpan = span(holder);
  return {
    holder: [layout.holderFrom ?? holderSpan[0], holderSpan[1]],
    share: span(share),
    units: units >= 0 ? span(units) : undefined,
  };
}

const inside = (glyph: Glyph, [from, to]: Span): boolean => centre(glyph) >= from && centre(glyph) < to;

/**
 * El texto de una celda. Dos trozos que se tocan son la misma palabra: hay
 * maquetas que parten «11.474» en «11», «.» y «474».
 */
const joined = (glyphs: readonly Glyph[]): string =>
  glyphs
    .reduce((text, glyph, index) => {
      const before = glyphs[index - 1];
      const glue = before && glyph.x - before.right < 0.8 ? '' : ' ';
      return `${text}${glue}${glyph.text}`;
    }, '')
    .replace(/\s+/gu, ' ')
    .trim();

const cell = (row: PdfRow, span: Span | undefined): string =>
  span ? joined(row.glyphs.filter((glyph) => inside(glyph, span))) : '';

/**
 * La cifra de una columna numérica: la celda entera si tiene la forma buscada
 * —así llegan las cifras partidas en trozos, «11», «.», «474»— y si no, el
 * trozo que la tiene, porque una cifra pequeña de la columna vecina, alineada
 * a la derecha, puede asomar dentro del tramo («2 0.0004%»).
 */
function figure(row: PdfRow, span: Span | undefined, shape: RegExp): string {
  if (!span) return '';
  const whole = cell(row, span);
  if (shape.test(whole)) return whole;
  const own = row.glyphs.filter((glyph) => inside(glyph, span) && shape.test(glyph.text));
  return own.at(-1)?.text ?? whole;
}

const shareOf = (row: PdfRow, columns: Columns): string => figure(row, columns.share, PERCENT);
const unitsCell = (row: PdfRow, columns: Columns): string => figure(row, columns.units, NUMBER);

/** Un rótulo de cabecera es corto: una frase que nombra la razón social no lo es. */
const isLabel = (glyph: Glyph, pattern: RegExp): boolean => glyph.text.length <= 45 && pattern.test(glyph.text);

/**
 * La cabecera del cuadro: el primer renglón con un rótulo de titular cuya
 * cabecera completa trae también el del porcentaje. El título del cuadro
 * —«Cuadro No. 11 Accionistas del Banco»— también nombra a los accionistas y
 * no es la cabecera; por eso se prueba renglón por renglón.
 */
function headerOf(rows: readonly PdfRow[], layout: TableLayout): { start: number; header: PdfRow[]; columns: Columns } | undefined {
  const from = layout.anchor ? rows.findIndex((row) => layout.anchor?.test(row.text)) : 0;
  if (from < 0) return undefined;
  for (let start = from; start < rows.length; start += 1) {
    if (!rows[start]?.glyphs.some((glyph) => isLabel(glyph, HOLDER_HEADER))) continue;
    const header = headerLines(rows, start);
    const columns = columnsOf(header, layout);
    if (columns) return { start, header, columns };
  }
  return undefined;
}

/**
 * La cabecera puede ocupar hasta cuatro renglones: los rótulos de dos líneas
 * («N° DE» sobre «ACCIONES») van centrados y su `y` cae entre las dos de los
 * vecinos. Sigue mientras el renglón esté pegado al anterior y no traiga cifras.
 */
function headerLines(rows: readonly PdfRow[], start: number): PdfRow[] {
  const lines: PdfRow[] = [];
  for (const row of rows.slice(start, start + 4)) {
    const above = lines.at(-1);
    if (above && (row.page !== above.page || above.y - row.y >= 8 || row.glyphs.some((glyph) => /\d/u.test(glyph.text)))) break;
    lines.push(row);
  }
  return lines;
}

interface Draft {
  holder: string;
  printed: string;
  units: string;
  y: number;
  page: number;
}

const FULL = /^100(?:[.,]0+)?\s?%?$/u;

/** La fila de total: «TOTAL» con el cien o sin cifra, o el cien solo. */
const isTotal = (holder: string, share: string): boolean =>
  (TOTAL.test(holder) && (!share || FULL.test(share))) || (!holder && FULL.test(share));

/** Un subtotal —«Total Grupo Bedoya»— no es titular ni cierra el cuadro. */
const isSubtotal = (holder: string, share: string): boolean => TOTAL.test(holder) && !isTotal(holder, share);

/** Los renglones del cuadro hasta la fila de total o hasta un hueco grande en la misma página. */
function bodyOf(rows: readonly PdfRow[], columns: Columns, maxGap: number): { body: PdfRow[]; total: PdfRow | undefined } {
  const body: PdfRow[] = [];
  for (const row of rows) {
    const above = body.at(-1);
    if (above && above.page === row.page && above.y - row.y > maxGap && body.some((one) => PERCENT.test(shareOf(one, columns)))) break;
    if (isTotal(cell(row, columns.holder), shareOf(row, columns))) return { body, total: row };
    if (isSubtotal(cell(row, columns.holder), shareOf(row, columns))) continue;
    body.push(row);
  }
  return { body, total: undefined };
}

/**
 * Las filas, con los renglones de nombre pegados a la fila de cifras más
 * cercana. Un nombre largo se parte en dos y la maqueta pone las cifras en el
 * primer renglón, en el segundo o entre los dos; la distancia a la fila de
 * cifras de arriba y a la de abajo dice de cuál es. Un renglón de nombre en otra
 * página que su fila de cifras es pie o cabecera de página y no se usa.
 */
function draftsOf(body: readonly PdfRow[], columns: Columns): Draft[] {
  const numbered = body.filter((row) => PERCENT.test(shareOf(row, columns)));
  const drafts = new Map<PdfRow, Draft>(
    numbered.map((row) => [
      row,
      { holder: cell(row, columns.holder), printed: shareOf(row, columns), units: unitsCell(row, columns), y: row.y, page: row.page },
    ]),
  );
  const prefixes = new Map<PdfRow, string[]>();
  const suffixes = new Map<PdfRow, string[]>();
  for (const row of body) {
    const holder = cell(row, columns.holder);
    if (drafts.has(row) || !holder) continue;
    const up = [...numbered].reverse().find((one) => one.page === row.page && one.y > row.y);
    const down = numbered.find((one) => one.page === row.page && one.y < row.y);
    const gapUp = up ? up.y - row.y : Infinity;
    const gapDown = down ? row.y - down.y : Infinity;
    if (up && gapUp <= gapDown && gapUp < 12) suffixes.set(up, [...(suffixes.get(up) ?? []), holder]);
    else if (down && gapDown < 12) prefixes.set(down, [...(prefixes.get(down) ?? []), holder]);
  }
  return numbered.map((row) => {
    const draft = drafts.get(row) as Draft;
    const parts = [...(prefixes.get(row) ?? []), draft.holder, ...(suffixes.get(row) ?? [])];
    return { ...draft, holder: parts.filter(Boolean).join(' ') };
  });
}

/**
 * Lee el primer cuadro de accionistas de las filas dadas.
 *
 * El extracto de cada fila son sólo tres celdas —titular, acciones y
 * porcentaje—, no el renglón entero: los prospectos imprimen al lado el carnet
 * de identidad de cada accionista persona, y ese número no tiene por qué salir
 * del documento.
 */
export function readStakeTable(rows: readonly PdfRow[], layout: TableLayout = {}): StakeTable | undefined {
  const found = headerOf(rows, layout);
  if (!found) return undefined;
  const { start, header, columns } = found;
  const { body, total } = bodyOf(rows.slice(start + header.length), columns, layout.maxGap ?? 45);
  const lines = draftsOf(body, columns);
  const headerCell = (span: Span | undefined): string =>
    span ? header.map((line) => cell(line, span)).filter(Boolean).join(' ') : '';
  const quote = (...parts: string[]): string => parts.filter(Boolean).join(' | ');
  const totalShare = total ? shareOf(total, columns) : '';
  const totalUnits = total ? unitsCell(total, columns) : '';
  return {
    lines: lines.map(({ holder, printed, units }) => ({
      holder,
      printed,
      share: percentOf(printed),
      units: NUMBER.test(units) ? unitsOf(units) : undefined,
      text: quote(holder, units, printed),
    })),
    total: PERCENT.test(totalShare) ? percentOf(totalShare) : undefined,
    totalUnits: NUMBER.test(totalUnits) ? unitsOf(totalUnits) : undefined,
    header: quote(headerCell(columns.holder), headerCell(columns.units), headerCell(columns.share)),
  };
}
