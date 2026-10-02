import type { PdfRow } from './pdf-rows';
import { plain } from './registry-flow-keys';
import { spanishNumber } from './business-common';

/**
 * Lo que el SEPREC publica de los flujos del registro, y cómo se lee.
 *
 * Desde abril de 2022 el registro lo lleva el Estado y sus «Información
 * estadística» mensuales son infografías: las cifras por departamento, forma
 * societaria y actividad son imágenes sin texto, y lo único legible es la
 * página que resume el año en frases («De enero a diciembre de 2023 con 16.471
 * inscripciones») y un gráfico de barras de renovaciones con sus rótulos. Por
 * eso del SEPREC salen totales nacionales y, de las renovaciones, el reparto
 * por periodo de renovación; nada más se puede leer sin transcribir.
 */

/** Una cifra del SEPREC: de qué año, de qué meses y la frase que la dice. */
export interface SeprecFigure {
  readonly year: string;
  /** Los meses que cubre si no es la gestión entera, p. ej. «abril a diciembre». */
  readonly months?: string;
  readonly key: string;
  readonly value: string;
  readonly excerpt: string;
}

const MONTHS = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre';

/** «De enero a diciembre de 2023 con 16.471 inscripciones.» */
export function seprecNew(rows: readonly PdfRow[]): SeprecFigure[] {
  const pattern = new RegExp(`De (${MONTHS}) a (${MONTHS}) de (\\d{4}) con ([\\d.]+) inscripciones`, 'u');
  return rows.flatMap((row) => {
    const hit = pattern.exec(row.text);
    if (!hit) return [];
    const [, from = '', to = '', year = '', printed = ''] = hit;
    const whole = from === 'enero' && to === 'diciembre';
    return [{ year, key: 'BOLIVIA', value: spanishNumber(printed), excerpt: row.text, ...(whole ? {} : { months: `${from} a ${to}` }) }];
  });
}

/** «Al mes de diciembre de 2023 con 80.123 unidades económicas.» */
export function seprecRenewed(rows: readonly PdfRow[]): SeprecFigure[] {
  const pattern = new RegExp(`Al mes (?:de )?(${MONTHS}) de (\\d{4}) con ([\\d.]+) unidades`, 'u');
  return rows.flatMap((row) => {
    const hit = pattern.exec(row.text);
    if (!hit) return [];
    const [, month = '', year = '', printed = ''] = hit;
    const whole = month === 'diciembre';
    return [{ year, key: 'BOLIVIA', value: spanishNumber(printed), excerpt: row.text, ...(whole ? {} : { months: `enero a ${month}` }) }];
  });
}

/**
 * «En la gestión 2022, a nivel nacional se han inscrito 17.117 unidades
 * económicas» —la Memoria 2022-2025—, que es la única cifra de 2022 entero:
 * los mensuales dan abril a diciembre porque enero a marzo los inscribió
 * todavía FUNDEMPRESA.
 */
export function seprecMemoryNew(rows: readonly PdfRow[]): SeprecFigure[] {
  return rows.flatMap((row) => {
    // «gestión» llega como «gesƟón»: la fuente usa una ligadura para «ti».
    const hit = /ges\S*n (\d{4}), a nivel nacional se han inscrito ([\d.]+) unidades/u.exec(row.text);
    if (!hit) return [];
    return [{ year: hit[1] ?? '', key: 'BOLIVIA', value: spanishNumber(hit[2] ?? ''), excerpt: row.text }];
  });
}

const RENEWAL_GROUPS: readonly (readonly [string, string])[] = [
  ['MINERAS', 'MINERAS'],
  ['COMERCIALES', 'COMERCIALES'],
  ['INDUSTRIALES', 'INDUSTRIALES'],
  ['AGROINDUSTRIALES', 'AGROINDUSTRIALES'],
];

/**
 * El reparto de las renovaciones por periodo de renovación, leído del gráfico.
 *
 * El gráfico agrupa cuatro barras por año —mineras, comerciales, industriales y
 * agroindustriales, en el orden de la leyenda— y rotula cada una con su cifra.
 * El rótulo se ata a su año por la `x` de la etiqueta del eje más cercana y a
 * su barra por el orden de izquierda a derecha dentro del grupo; la leyenda da
 * ese orden. La prueba de que el reparto está bien atado es que las cuatro
 * cifras de cada año suman el total que la misma página escribe en una frase.
 */
export function seprecRenewalGroups(
  rows: readonly PdfRow[],
  totals: readonly SeprecFigure[],
  where: string,
): SeprecFigure[] {
  const legend = rows.find((row) => /MINERAS .*AGROINDUSTRIALES/u.test(plain(row.text)));
  const axis = rows.find((row) => row.glyphs.length === 4 && row.glyphs.every((g) => /^20\d{2}$/u.test(g.text)));
  const title = rows.find((row) => /^Bolivia: Unidades econ\S+micas con su matr\S+cula/u.test(row.text));
  if (!legend || !axis || !title) throw new Error(`${where}: no se encontró el título, la leyenda o el eje del gráfico`);
  const printedOrder = [...legend.glyphs].sort((a, b) => a.x - b.x).map((g) => g.text);
  const order = printedOrder.map(plain);
  const names = order.map((label) => RENEWAL_GROUPS.find(([word]) => label === word)?.[1]);
  if (names.some((name) => !name)) throw new Error(`${where}: leyenda inesperada «${legend.text}»`);
  const labels = rows
    .filter((row) => row.y > axis.y && row.y < title.y && row.page === axis.page)
    .flatMap((row) => row.glyphs.filter((g) => /^\d{1,3}(?:\.\d{3})*$/u.test(g.text)).map((g) => ({ g, row })))
    .filter(({ g }) => g.x > Math.min(...axis.glyphs.map((a) => a.x)) - 60);
  const figures: SeprecFigure[] = [];
  for (const tick of axis.glyphs) {
    const mine = labels
      .filter(({ g }) => {
        const nearest = [...axis.glyphs].sort((a, b) => Math.abs(a.x - g.x) - Math.abs(b.x - g.x))[0];
        return nearest === tick;
      })
      .sort((a, b) => (a.g.x + a.g.right) / 2 - (b.g.x + b.g.right) / 2);
    const total = totals.find((one) => one.year === tick.text);
    const sum = mine.reduce((acc, { g }) => acc + Number(spanishNumber(g.text)), 0);
    if (mine.length !== 4 || !total || String(sum) !== total.value) {
      throw new Error(`${where}: ${tick.text} trae ${mine.length} rótulos que suman ${sum}, no ${total?.value}`);
    }
    mine.forEach(({ g }, index) => {
      figures.push({
        year: tick.text,
        key: names[index] ?? '',
        value: spanishNumber(g.text),
        excerpt: JSON.stringify({
          grafico: title.text,
          gestion: tick.text,
          barra: `${index + 1} de 4`,
          serie: printedOrder[index],
          cifra: g.text,
        }),
        ...(total.months ? { months: total.months } : {}),
      });
    });
  }
  return figures;
}
