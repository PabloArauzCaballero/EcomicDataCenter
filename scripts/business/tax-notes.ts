import type { PdfRow } from './pdf-rows';
import type { WealthLayout } from './tax-sources';
import { joinGlyphs, mendSeparators, plainNumber } from './tax-geometry';

/**
 * Las cifras que las memorias dicen en una oración y no en una celda.
 *
 * Cuánto pesan las cien empresas en la recaudación lo dice la nota al pie del
 * ránking («Al 2019 el 60% de la recaudación corresponde a las 100 empresas
 * detalladas…»), y el Impuesto a las Grandes Fortunas sólo se cuenta en un
 * párrafo: cuántos contribuyentes inscritos y cuánto se recaudó. El extracto
 * de cada punto es la oración entera, porque esa es la prueba.
 */

/** Una cifra dicha en una oración, con la oración. */
export interface Stated {
  readonly figure: string;
  readonly printed: string;
  readonly sentence: string;
}

const COVERAGE =
  /(?:Al|A)\s+(?:octubre\s+(?:de\s+)?)?\d{4},?\s+el\s+(\d{1,3}(?:[.,]\d{1,2})?)\s?%\s+de\s+la\s+recaudaci[oó]n\s+(?:corresponde\s+a|est[aá]\s+a\s+cargo\s+de)\s+las\s+100\s+empresas\s+detalladas[^(:]*/iu;

/** La nota que dice qué parte de la recaudación hicieron las cien. */
export function coverageNote(trailer: readonly PdfRow[]): (Stated & { page: number }) | undefined {
  for (const row of trailer) {
    const text = mendSeparators(row.text).replace(/\s+/gu, ' ');
    const match = COVERAGE.exec(text);
    if (match?.[1]) {
      return {
        figure: plainNumber(match[1]),
        printed: match[1],
        sentence: match[0].trim(),
        page: row.page,
      };
    }
  }
  return undefined;
}

/** El texto de una página leído columna por columna, como lo lee una persona. */
export function columnText(rows: readonly PdfRow[], layout: WealthLayout): string {
  return layout.columns
    .map(([from, to]) =>
      rows
        .filter((row) => row.page === layout.page)
        .map((row) => joinGlyphs(row.glyphs.filter((glyph) => glyph.x >= from && glyph.x < to)))
        .filter(Boolean)
        .join(' '),
    )
    .join(' ')
    .replace(/\s+/gu, ' ');
}

/*
 * Las dos oraciones se recortan a la cláusula que dice la cifra. El párrafo
 * corre por dos columnas y a veces lo interrumpe un gráfico; la oración entera,
 * leída columna por columna, arrastraría texto del cuadro de al lado.
 */
const PAYERS =
  /(?:(?:A fecha [\d/]+|A diciembre(?: de)? \d{4}|Al \d{1,2} de \p{L}+(?: de)? \d{4}),?\s+)?se tienen?\s+registrados\s+(?:a\s+)?(\d{1,3}(?:[.,]\d{3})?)\s+contribuyentes(?:[^,.]{0,90}?Padr[oó]n(?:\s+de\s+Contribuyentes)?)?/iu;
const COLLECTED =
  /(?:desde el periodo [^,.]{0,40}?)?se ha llegado a recaudar\s+por\s+este\s+Impuestos?\s+Bs\.?\s?(\d[\d.,]*\d)(?:\.-)?/iu;

/** Cuántos contribuyentes inscritos en el impuesto, según el párrafo. */
export function wealthPayers(text: string): Stated | undefined {
  const match = PAYERS.exec(text);
  if (!match?.[1]) return undefined;
  return { figure: plainNumber(match[1]), printed: match[1], sentence: match[0].trim() };
}

/**
 * Cuánto se recaudó, si la cifra se puede leer.
 *
 * La memoria 2023 imprime «Bs180.466.79,8»: un grupo de dos dígitos donde van
 * tres. El monto en letras dice otra cosa y no hay forma de saber cuál de las
 * dos es la errata, así que la cifra no se toma y el año queda como hueco.
 */
export function wealthCollected(text: string): (Stated & { malformed?: string }) | undefined {
  const match = COLLECTED.exec(text);
  if (!match?.[1]) return undefined;
  const sentence = match[0].trim();
  if (!/^\d{1,3}([.,])\d{3}(?:\1\d{3})*(?:[.,]\d{1,2})?$/u.test(match[1])) {
    return { figure: '', printed: match[1], sentence, malformed: match[1] };
  }
  return { figure: plainNumber(match[1]), printed: match[1], sentence };
}
