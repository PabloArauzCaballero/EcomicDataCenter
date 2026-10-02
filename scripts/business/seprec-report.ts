import type { PdfRow } from './pdf-rows';
import { activity, legalForm, repairAccents } from './registry-sources';

/**
 * Lo que el reporte mensual del SEPREC dice de la base empresarial, leído por
 * posición.
 *
 * El reporte publica una tabla —la de actividades— y el resto en gráficos de
 * barras cuyas cifras son etiquetas de texto. Una etiqueta se ata a su barra
 * por la geometría y no por el orden en que aparece en el texto: pasado a
 * texto corrido, el gráfico de departamentos imprime las cifras en un orden y
 * los nombres en otro. Cada lectura comprueba contra algo que el mismo reporte
 * dice: un total, o las frases que nombran a los tres primeros.
 */

/** Una lectura del reporte, con la línea de la que salió. */
export interface ReportReading {
  readonly key: string;
  readonly label: string;
  readonly cifra: string;
  readonly quote: string;
}

const COUNT = /^\d{1,3}(?:\.\d{3})*$/u;
const plain = (count: string): string => count.replace(/\./gu, '');

const PLACES: readonly [string, RegExp][] = [
  ['LA_PAZ', /^La Paz$/u],
  ['SANTA_CRUZ', /^Santa Cruz$/u],
  ['COCHABAMBA', /^Cochabamba$/u],
  ['TARIJA', /^Tarija$/u],
  ['ORURO', /^Oruro$/u],
  ['POTOSI', /^Potos/u],
  ['CHUQUISACA', /^Chuquisaca$/u],
  ['BENI', /^Beni$/u],
  ['PANDO', /^Pando$/u],
];

/** La página en la que un título aparece, para no depender del número de página. */
export function pageWith(rows: readonly PdfRow[], title: RegExp): number {
  const row = rows.find((one) => title.test(one.text));
  if (!row) throw new Error(`el reporte no trae ${String(title)}`);
  return row.page;
}

/**
 * Las cifras de un gráfico de barras horizontal, por departamento.
 *
 * Cada departamento es un rótulo a la izquierda; sus barras dejan la cifra
 * arriba (`above`) y, cuando hay dos series, abajo (`below`), a una distancia
 * vertical de menos de veinte puntos. Un rótulo que no encuentra exactamente
 * las cifras que espera detiene la corrida.
 */
export function placeBars(
  rows: readonly PdfRow[],
  page: number,
  series: 'one' | 'two',
): { key: string; above: string; below?: string; quote: string }[] {
  const glyphs = rows
    .filter((row) => row.page === page)
    .flatMap((row) => row.glyphs.map((glyph) => ({ ...glyph, line: row.text })));
  const labels = glyphs.filter((glyph) => glyph.x < 140);
  const counts = glyphs.filter((glyph) => glyph.x >= 140 && COUNT.test(glyph.text));
  return PLACES.map(([key, pattern]) => {
    const label = labels.find((glyph) => pattern.test(glyph.text));
    if (!label) throw new Error(`página ${page}: falta el rótulo ${key}`);
    const near = counts.filter((count) => Math.abs(count.y - label.y) < 20);
    if (series === 'one') {
      if (near.length !== 1) {
        throw new Error(`página ${page}: ${key} tiene ${near.length} cifras y se esperaba una`);
      }
      const only = near[0]!;
      return { key, above: plain(only.text), quote: repairAccents(`${label.text} ${only.text}`) };
    }
    const above = near.filter((count) => count.y > label.y);
    const below = near.filter((count) => count.y < label.y);
    if (above.length !== 1 || below.length !== 1) {
      throw new Error(`página ${page}: ${key} no tiene una cifra arriba y otra abajo`);
    }
    return {
      key,
      above: plain(above[0]!.text),
      below: plain(below[0]!.text),
      quote: repairAccents(`${label.text} ${above[0]!.text} ${below[0]!.text}`),
    };
  });
}

/** La tabla de actividades: una fila por sección con su cantidad. */
export function activityTable(rows: readonly PdfRow[], page: number): ReportReading[] {
  const table = rows.filter(
    (row) => row.page === page && row.glyphs.length >= 3 && COUNT.test(row.glyphs.at(-2)?.text ?? ''),
  );
  return table
    .filter((row) => !/^TOTAL/u.test(row.glyphs.at(-3)?.text ?? ''))
    .map((row) => {
      const name = row.glyphs.slice(0, -2).map((glyph) => glyph.text).join(' ');
      const found = activity(name);
      return {
        key: found.key,
        label: found.label,
        cifra: plain(row.glyphs.at(-2)!.text),
        quote: repairAccents(row.text),
      };
    });
}

/** El total que el reporte imprime al pie de la tabla de actividades. */
export function tableTotal(rows: readonly PdfRow[], page: number): string {
  const total = rows.find((row) => row.page === page && /^TOTAL\b/u.test(row.text));
  const cifra = total?.glyphs.find((glyph) => COUNT.test(glyph.text));
  if (!cifra) throw new Error(`página ${page}: la tabla no trae su total`);
  return plain(cifra.text);
}

/**
 * El gráfico de columnas por tipo societario.
 *
 * Los rótulos ocupan tres renglones al pie de cada columna; la cifra de la
 * columna es la que cae más cerca en `x` del centro de su rótulo.
 */
export function legalFormColumns(rows: readonly PdfRow[], page: number): ReportReading[] {
  const own = rows.filter((row) => row.page === page);
  const head = own.find((row) => /Unipersonal/u.test(row.text) && row.glyphs.length >= 8);
  if (!head) throw new Error(`página ${page}: no está el pie del gráfico de tipos`);
  const footer = own.filter((row) => row.y <= head.y + 20 && row.y >= head.y - 40);
  const counts = own
    .filter((row) => row.y > head.y + 20 && row.y < head.y + 340)
    .flatMap((row) => row.glyphs.filter((glyph) => COUNT.test(glyph.text) && glyph.x > 120));
  const columns = footer
    .flatMap((row) => row.glyphs)
    .reduce<{ x: number; words: string[] }[]>((all, glyph) => {
      const column = all.find((one) => Math.abs(one.x - glyph.x) < 45);
      if (column) column.words.push(glyph.text);
      else all.push({ x: glyph.x, words: [glyph.text] });
      return all;
    }, []);
  return columns.map((column) => {
    const name = column.words.join(' ');
    const nearest = [...counts].sort(
      (left, right) => Math.abs(left.x - column.x - 10) - Math.abs(right.x - column.x - 10),
    )[0];
    if (!nearest) throw new Error(`página ${page}: «${name}» no tiene cifra`);
    const form = legalForm(name);
    return { key: form.key, label: form.label, cifra: plain(nearest.text), quote: repairAccents(`${name}: ${nearest.text}`) };
  });
}
