import type { Glyph, PdfRow } from './pdf-rows';
import {
  columnCuts,
  columnOf,
  folded,
  isFigure,
  joinGlyphs,
  nearestAnchor,
  printedFigure,
  rowPitch,
} from './tax-geometry';
import { DEPARTMENTS } from './business-common';

/**
 * El ránking de «Las 100 empresas que más impuestos pagaron», leído por posición.
 *
 * Cada fila tiene puesto, razón social, departamento y cuatro cifras: el total
 * pagado y la participación de dos gestiones. Qué par es la gestión del cuadro
 * no se declara a mano: el ránking está ordenado por esa gestión, así que es el
 * par cuyo total no sube nunca al bajar en la tabla (2025 lo imprime a la
 * derecha, 2012 a la izquierda; el orden lo dice, no la costumbre).
 */

/** Una fila del ránking, con las celdas como se imprimen. */
export interface TopRow {
  readonly rank: number;
  readonly company: string;
  readonly department: string;
  /** Las cuatro cifras de izquierda a derecha, como se imprimen. */
  readonly cells: readonly [string, string, string, string];
  readonly page: number;
}

/** Un cuadro leído: las filas y lo que quedó colgando sin fila. */
export interface TopTable {
  readonly rows: TopRow[];
  /** Las líneas de después del total, donde la nota dice cuánto pesan las cien. */
  readonly trailer: PdfRow[];
  /** Los rótulos de subtotal que siguen a cada puesto, en los anexos por grupo. */
  readonly groups: Map<number, string>;
  readonly stray: number;
}

const DEPARTMENT_NAMES = new Map(
  Object.values(DEPARTMENTS).map((name) => [folded(name), name] as const),
);

const isTotalOfHundred = (text: string): boolean => /^TOTAL A 100\b/u.test(folded(text));
const subtotalLabel = (text: string): string | undefined =>
  /^TOTAL\s+(?!A 100|RESTO|%)/u.test(folded(text))
    ? text.replace(/^\s*total\s+/iu, '').trim()
    : undefined;

/** Una línea de encabezado repetida al pie de la página anterior o al tope de esta. */
const isHeading = (row: PdfRow): boolean =>
  /PUESTO|RAZON SOCIAL|DEPARTAMENTO/u.test(folded(row.text));

/**
 * El trozo del puesto: un entero seguido de texto, en una fila con alguna cifra
 * con separador. Lo segundo deja afuera el «100 empresas» de los párrafos.
 */
function rankGlyph(row: PdfRow): Glyph | undefined {
  if (
    isHeading(row) ||
    !row.glyphs.some((glyph) => isFigure(glyph.text) && /[.,%]/u.test(glyph.text))
  ) {
    return undefined;
  }
  for (let index = 0; index < row.glyphs.length - 1; index += 1) {
    const glyph = row.glyphs[index];
    const next = row.glyphs[index + 1];
    if (!glyph || !next) continue;
    if (/^\d{1,3}$/u.test(glyph.text) && /\p{L}{2}/u.test(next.text)) return glyph;
  }
  return undefined;
}

interface Anchor {
  readonly row: PdfRow;
  readonly rank: Glyph;
  readonly extra: Glyph[];
}

/**
 * Las filas entre el comienzo pedido y el total de las cien.
 *
 * `after` dice cuántos «Total a 100» saltar antes de empezar: el anexo por
 * sector de 2012 empieza en la misma página donde termina el cuadro principal.
 */
function region(rows: readonly PdfRow[], after: number): { body: PdfRow[]; trailer: PdfRow[] } {
  let seen = 0;
  let start = 0;
  if (after > 0) {
    start = rows.findIndex((row) => isTotalOfHundred(row.text) && (seen += 1) === after) + 1;
    if (start === 0) throw new Error(`no aparece el total número ${after} de las cien`);
  }
  // El cuadro empieza en el puesto 1: lo de antes es el párrafo que lo presenta.
  start = rows.findIndex((row, index) => index >= start && rankGlyph(row)?.text === '1');
  if (start < 0) throw new Error('no aparece el puesto 1');
  const end = rows.findIndex((row, index) => index >= start && isTotalOfHundred(row.text));
  if (end < 0) throw new Error('el cuadro no cierra con «Total a 100»');
  return { body: rows.slice(start, end), trailer: rows.slice(end, end + 12) };
}

/** Separa el departamento del final del texto de la fila. */
function splitDepartment(texts: Glyph[]): { name: Glyph[]; department: string } {
  for (const take of [2, 1, 3]) {
    // La fila puede traer sólo el departamento: la razón social, centrada en
    // vertical, quedó en los renglones de arriba y de abajo.
    if (texts.length < take) continue;
    const tail = folded(joinGlyphs(texts.slice(-take)));
    const found = DEPARTMENT_NAMES.get(tail);
    if (found) return { name: texts.slice(0, -take), department: found };
  }
  return { name: texts, department: '' };
}

/** Las filas del cuadro, con sus líneas sueltas ya colgadas de la fila que les toca. */
export function readTopTable(rows: readonly PdfRow[], after: number, where: string): TopTable {
  const { body, trailer } = region(rows, after);
  const anchors: Anchor[] = [];
  const loose: PdfRow[] = [];
  const groups = new Map<number, string>();
  let pending: number[] = [];
  for (const row of body) {
    const rank = rankGlyph(row);
    if (rank) {
      anchors.push({ row, rank, extra: [] });
      pending.push(Number(rank.text));
      continue;
    }
    const figures = row.glyphs.filter((glyph) => isFigure(glyph.text)).length;
    const label = subtotalLabel(joinGlyphs(row.glyphs.filter((glyph) => !isFigure(glyph.text))));
    if (label && figures >= 2) {
      for (const member of pending) groups.set(member, label);
      pending = [];
      continue;
    }
    // Los encabezados que el anexo repite al cambiar de grupo y las llamadas
    // de nota sueltas («2», «3») no son parte de ninguna fila.
    // Tampoco la línea de los años bajo «TOTAL» y «% PART.» (2018): enteros
    // sin separador, que ninguna celda del cuadro imprime así.
    if (isHeading(row) || row.glyphs.every((glyph) => /^\d{1,4}$/u.test(glyph.text))) continue;
    // Ni las filas del resto y de la recaudación total, que 2020 imprime antes
    // del total de las cien.
    if (/^(ITF\b|RESTO\b|RECAUDACION TOTAL)/u.test(folded(row.text))) continue;
    loose.push(row);
  }
  const stray = attach(anchors, loose);
  return { rows: settle(anchors, where), trailer, groups, stray };
}

/**
 * Cuelga cada línea suelta de su fila.
 *
 * Primero lo cercano: tres cuartos del paso entre filas, que es lo que separa
 * un renglón de su fila cuando la celda centra el texto en vertical. Lo que
 * queda sin dueño entre dos filas es el tercer renglón de una celda centrada o
 * el segundo de una celda alineada arriba (2016: cae a 9,6 puntos de su fila
 * con un paso típico de 11,7, y el tercero queda más cerca de la fila de
 * abajo que de la suya). La página dice cuál de las dos: si algún renglón ya se
 * colgó por encima de su fila, las celdas se centran y va a la fila más
 * cercana; si no, se alinean arriba y va a la fila de encima.
 *
 * Devuelve cuántas líneas con cifras quedaron sin fila, que sería una celda
 * perdida; las de texto lejos de toda fila son encabezados y notas.
 */
function attach(anchors: readonly Anchor[], loose: readonly PdfRow[]): number {
  let stray = 0;
  for (const page of new Set(anchors.map((anchor) => anchor.row.page))) {
    const own = anchors.filter((anchor) => anchor.row.page === page);
    const pitch = rowPitch(own.map((anchor) => anchor.row));
    const top = Math.max(...own.map((anchor) => anchor.row.y));
    const bottom = Math.min(...own.map((anchor) => anchor.row.y));
    const leftovers: PdfRow[] = [];
    let centred = false;
    for (const line of loose.filter((row) => row.page === page)) {
      const anchor = nearestAnchor(line, own, pitch);
      if (anchor) {
        centred ||= line.y > anchor.row.y + 1;
        anchor.extra.push(...line.glyphs.filter((glyph) => glyph.x >= anchor.rank.x - 2));
        continue;
      }
      const between =
        line.y < top && line.y > bottom && !line.glyphs.some((glyph) => isFigure(glyph.text));
      if (between) leftovers.push(line);
      else if (line.glyphs.some((glyph) => isFigure(glyph.text) && /\d[.,]\d/u.test(glyph.text)))
        stray += 1;
    }
    for (const line of leftovers) {
      const above = own.filter((anchor) => anchor.row.y > line.y);
      const anchor = centred ? nearestAnchor(line, own, Number.POSITIVE_INFINITY) : above.at(-1);
      anchor?.extra.push(...line.glyphs.filter((glyph) => glyph.x >= anchor.rank.x - 2));
    }
  }
  return stray;
}

/** Las cifras con que termina una línea: lo que queda a la derecha del último texto. */
function trailingFigures(row: PdfRow): Glyph[] {
  const run: Glyph[] = [];
  for (const glyph of [...row.glyphs].reverse()) {
    if (!isFigure(glyph.text)) break;
    run.unshift(glyph);
  }
  return run;
}

/**
 * Dónde empiezan las cifras en una página: la mediana de dónde empiezan en
 * cada fila, con margen. Una fila sin la gestión anterior empieza igual.
 */
function figureZone(anchors: readonly Anchor[]): number {
  const starts = anchors
    .map((anchor) => trailingFigures(anchor.row)[0]?.x)
    .filter((x): x is number => x !== undefined)
    .sort((a, b) => a - b);
  return (starts[Math.floor(starts.length / 2)] ?? 0) - 15;
}

/** Corta cada fila en sus celdas, con las columnas de cifras leídas página por página. */
function settle(anchors: readonly Anchor[], where: string): TopRow[] {
  const zones = new Map<number, { start: number; cuts: number[] }>();
  for (const page of new Set(anchors.map((anchor) => anchor.row.page))) {
    const own = anchors.filter((anchor) => anchor.row.page === page);
    const start = figureZone(own);
    const figures = own
      .flatMap((anchor) => [...anchor.row.glyphs, ...anchor.extra])
      .filter((glyph) => isFigure(glyph.text) && glyph.x >= start);
    zones.set(page, { start, cuts: columnCuts(figures, 4, `${where} p. ${page}`) });
  }
  return anchors.map((anchor) => {
    const { start, cuts } = zones.get(anchor.row.page) ?? { start: 0, cuts: [] };
    const glyphs = [...anchor.row.glyphs, ...anchor.extra].filter(
      (glyph) => glyph !== anchor.rank && glyph.x > anchor.rank.x,
    );
    const figures = glyphs.filter((glyph) => isFigure(glyph.text) && glyph.x >= start);
    const texts = glyphs.filter((glyph) => !figures.includes(glyph) && glyph.x < start);
    const sameLine = texts.filter((glyph) => Math.abs(glyph.y - anchor.row.y) < 2.5);
    const others = texts.filter((glyph) => !sameLine.includes(glyph));
    const own = splitDepartment(sameLine);
    const name = own.name;
    let department = own.department;
    let rest = others;
    if (!department) {
      // El departamento impreso en otra línea de la misma celda, como la
      // razón social larga que lo empuja medio renglón.
      const moved = splitDepartment(others);
      department = moved.department;
      rest = moved.name;
    }
    const cell = (index: number): string =>
      printedFigure(joinGlyphs(figures.filter((glyph) => columnOf(glyph, cuts) === index)));
    // El mismo glifo sin nombre de las cifras de 2014 hace de punto en
    // «S�A�»: en una razón social sólo puede ser eso.
    const printed = linesOf([...name, ...rest]).replace(/\uFFFD/gu, '.');
    const glued = department ? undefined : gluedDepartment(printed);
    return {
      rank: Number(anchor.rank.text),
      company: capitalised(glued?.name ?? printed),
      department: glued?.department ?? department,
      cells: [cell(0), cell(1), cell(2), cell(3)],
      page: anchor.row.page,
    };
  });
}

/**
 * El departamento pegado al final del mismo trozo que la razón social: la
 * memoria 2015 escribe «… Sucursal Bolivia SANTA CRuZ» como un solo texto.
 */
function gluedDepartment(printed: string): { name: string; department: string } | undefined {
  for (const [key, department] of DEPARTMENT_NAMES) {
    if (folded(printed).endsWith(` ${key}`)) {
      return { name: printed.slice(0, printed.length - key.length).trim(), department };
    }
  }
  return undefined;
}

/** La razón social con mayúscula inicial: la fuente de 2015 cambia algunas «U» por «u». */
const capitalised = (name: string): string =>
  name.charAt(0).toLocaleUpperCase('es') + name.slice(1);

/** El nombre partido en renglones, de arriba abajo. */
function linesOf(glyphs: readonly Glyph[]): string {
  const lines: Glyph[][] = [];
  for (const glyph of [...glyphs].sort((left, right) => right.y - left.y)) {
    const line = lines.find((candidate) => Math.abs((candidate[0]?.y ?? 0) - glyph.y) < 2.5);
    if (line) line.push(glyph);
    else lines.push([glyph]);
  }
  return lines
    .map((line) => joinGlyphs(line))
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();
}
