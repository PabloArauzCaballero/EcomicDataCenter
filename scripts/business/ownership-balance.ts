import type { Glyph, PdfRow } from './pdf-rows';

/**
 * La fila «Total patrimonio» del balance que trae un prospecto, por gestión.
 *
 * El prospecto resume el balance del emisor en un cuadro de tres o cuatro
 * columnas —los últimos cierres y, a veces, un corte intermedio— con la fecha
 * de cada columna en la cabecera: «31-dic-14», «31/03/2016», «jun-22». Aquí se
 * busca esa cabecera, se toma la `x` de cada fecha y cada cifra de la fila del
 * patrimonio se asigna a la fecha que tiene encima. Sólo se guardan las
 * columnas del mes de cierre que el documento declara: un corte a julio es una
 * foto a medio ejercicio y no se compara con un cierre.
 */

export interface ClosingFigure {
  /** La gestión: el año de la fecha de cierre. */
  readonly year: string;
  /** La cifra como la imprime el documento. */
  readonly printed: string;
  /** La fecha de la columna, como la imprime la cabecera. */
  readonly column: string;
  /** El renglón entero, que es el extracto. */
  readonly line: string;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DATE = /^(?:(\d{1,2})[-/. ])?([a-z]{3}|\d{1,2})[a-z]*[-/. ](\d{2}|\d{4})$/iu;
const FIGURE = /^\(?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\)?$/u;
const TOTAL_EQUITY = /^total\s+patrimonio(?:\s+neto)?\s*$/iu;

const centre = (glyph: Glyph): number => (glyph.x + glyph.right) / 2;

/** Mes y año de una fecha de cabecera, o nada si no es una fecha. */
function columnDate(text: string): { month: number; year: string } | undefined {
  const match = DATE.exec(text.trim());
  if (!match) return undefined;
  const monthText = (match[2] ?? '').toLowerCase();
  const month = /^\d+$/u.test(monthText) ? Number(monthText) : MONTHS.indexOf(monthText.slice(0, 3)) + 1;
  const short = match[3] ?? '';
  const year = short.length === 2 ? `20${short}` : short;
  return month >= 1 && month <= 12 ? { month, year } : undefined;
}

/**
 * Una cifra impresa como el corpus la guarda.
 *
 * Los prospectos usan las dos ortografías —«1,637.17» y «2.323,49»— y hasta
 * cifras sin decimales con puntos de miles. Si hay dos separadores, el último
 * es el decimal; si hay uno solo seguido de tres cifras, es de miles.
 */
export function plainFigure(printed: string): string {
  const negative = /^\(.*\)$|^-/u.test(printed);
  const bare = printed.replace(/[()\s-]/gu, '');
  const last = Math.max(bare.lastIndexOf('.'), bare.lastIndexOf(','));
  const decimals = last >= 0 ? bare.length - last - 1 : 0;
  const both = bare.includes('.') && bare.includes(',');
  const isDecimal = last >= 0 && (both || decimals !== 3);
  const whole = (isDecimal ? bare.slice(0, last) : bare).replace(/[.,]/gu, '');
  const text = isDecimal ? `${whole}.${bare.slice(last + 1)}` : whole;
  return negative ? `-${text}` : text;
}

/** Las cifras de cierre de la fila del patrimonio, una por columna de cierre. */
export function closingEquity(rows: readonly PdfRow[], closingMonth: number): ClosingFigure[] {
  const index = rows.findIndex((row) =>
    TOTAL_EQUITY.test(row.glyphs.filter((glyph) => !FIGURE.test(glyph.text)).map((glyph) => glyph.text).join(' ')),
  );
  const target = rows[index];
  if (!target) return [];
  const header = rows
    .slice(0, index)
    .reverse()
    .find((row) => row.page === target.page && row.glyphs.filter((glyph) => columnDate(glyph.text)).length >= 2);
  if (!header) return [];
  const columns = header.glyphs.flatMap((glyph) => {
    const date = columnDate(glyph.text);
    return date ? [{ ...date, text: glyph.text, x: centre(glyph) }] : [];
  });
  return target.glyphs
    .filter((glyph) => FIGURE.test(glyph.text))
    .flatMap((glyph) => {
      const nearest = [...columns].sort((a, b) => Math.abs(a.x - centre(glyph)) - Math.abs(b.x - centre(glyph)))[0];
      if (!nearest || nearest.month !== closingMonth || Math.abs(nearest.x - centre(glyph)) > 40) return [];
      return [{ year: nearest.year, printed: glyph.text, column: nearest.text, line: target.text }];
    });
}
