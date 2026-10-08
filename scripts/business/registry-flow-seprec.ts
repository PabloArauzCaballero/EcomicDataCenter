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
 * eso del SEPREC salen totales nacionales, el reparto de renovaciones por
 * periodo y las cancelaciones por departamento que sus memorias rotulan como
 * texto; los demás desgloses no se transcriben a mano.
 */

/** Una cifra del SEPREC: de qué año, de qué meses y la frase que la dice. */
export interface SeprecFigure {
  readonly year: string;
  /** Los meses que cubre si no es la gestión entera, p. ej. «abril a diciembre». */
  readonly months?: string;
  readonly key: string;
  readonly value: string;
  readonly excerpt: string;
  readonly note?: string;
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
    return [
      {
        year,
        key: 'BOLIVIA',
        value: spanishNumber(printed),
        excerpt: row.text,
        ...(whole ? {} : { months: `${from} a ${to}` }),
      },
    ];
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
    return [
      {
        year,
        key: 'BOLIVIA',
        value: spanishNumber(printed),
        excerpt: row.text,
        ...(whole ? {} : { months: `enero a ${month}` }),
      },
    ];
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

const CANCELLATION_DEPARTMENTS: readonly {
  readonly key: string;
  readonly label: string;
  readonly pattern: RegExp;
}[] = [
  { key: 'LA_PAZ', label: 'La Paz', pattern: /LA P\s*AZ/u },
  { key: 'SANTA_CRUZ', label: 'Santa Cruz', pattern: /SANTA CRUZ/u },
  { key: 'COCHABAMBA', label: 'Cochabamba', pattern: /COCHABAMBA/u },
  { key: 'TARIJA', label: 'Tarija', pattern: /TARIJA/u },
  { key: 'ORURO', label: 'Oruro', pattern: /ORURO/u },
  { key: 'POTOSI', label: 'Potosí', pattern: /POTOSI/u },
  { key: 'CHUQUISACA', label: 'Chuquisaca', pattern: /CHUQUISACA/u },
  { key: 'BENI', label: 'Beni', pattern: /BENI/u },
  { key: 'PANDO', label: 'Pando', pattern: /PANDO/u },
];

const printedNumbers = (text: string): string[] => text.match(/(?<![\d.,])\d{1,3}(?:\.\d{3})*(?![\d.,%])/gu) ?? [];

/**
 * Cancelaciones anuales y su reparto departamental en las memorias del SEPREC.
 *
 * La memoria 2022 contiene una errata interna: la frase introductoria imprime
 * 2.491, pero el gráfico nacional imprime 3.339 y sus nueve departamentos
 * también suman 3.339. Sólo se acepta una discrepancia si el gráfico de la
 * misma memoria confirma exactamente la suma completa del reparto.
 */
export function seprecCancelled(rows: readonly PdfRow[], year: string): SeprecFigure[] {
  const title = rows.find((row) => {
    const text = plain(row.text);
    return text.startsWith('BOLIVIA CANCELACION') && text.includes('DEPARTAMENTO');
  });
  const datedTitle = title && rows.some((row) => row.page === title.page && Math.abs(row.y - title.y) <= 20 && plain(row.text).includes(year));
  if (!title || !datedTitle) {
    throw new Error(`Memoria SEPREC ${year}: no se encontró el gráfico de cancelaciones por departamento`);
  }

  const source = rows.find((row) => row.page === title.page && /^FUENTE/u.test(plain(row.text)));
  const chartRows = rows.filter((row) => row.page === title.page && row.y < title.y && (!source || row.y > source.y));
  const departments = CANCELLATION_DEPARTMENTS.map((department) => {
    const named = chartRows.find((row) => department.pattern.test(plain(row.text)));
    if (!named) throw new Error(`Memoria SEPREC ${year}: falta ${department.label} en cancelaciones`);
    const nearby = chartRows.filter((row) => Math.abs(row.y - named.y) <= 7).sort((left, right) => Math.abs(left.y - named.y) - Math.abs(right.y - named.y));
    const printed = nearby.flatMap((row) => printedNumbers(row.text))[0];
    if (!printed) throw new Error(`Memoria SEPREC ${year}: falta la cifra de ${department.label}`);
    return {
      year,
      key: department.key,
      value: spanishNumber(printed),
      excerpt: named.text,
    } satisfies SeprecFigure;
  });

  const sum = departments.reduce((total, figure) => total + Number(figure.value), 0);
  const sentence = rows.find((row) => {
    const text = plain(row.text);
    return text.includes(year) && text.includes('CANCELARON') && text.includes('UNIDADES ECONOMICAS');
  });
  const sentenceValue = sentence
    ? printedNumbers(sentence.text)
        .map(spanishNumber)
        .find((value) => value !== year)
    : undefined;
  if (!sentenceValue) throw new Error(`Memoria SEPREC ${year}: falta el total narrado de cancelaciones`);

  let excerpt = sentence?.text ?? '';
  let note: string | undefined;
  if (Number(sentenceValue) !== sum) {
    const chartConfirmsSum = rows.some((row) => row.page !== title.page && row.text.trim() === sum.toLocaleString('es-BO'));
    if (!chartConfirmsSum) {
      throw new Error(`Memoria SEPREC ${year}: los departamentos suman ${sum}, no ${sentenceValue}`);
    }
    excerpt = JSON.stringify({ frase: sentence?.text, totalGrafico: sum, sumaDepartamentos: sum });
    note = `La frase introductoria de ${year} imprime ${Number(sentenceValue).toLocaleString('es-BO')}, pero el gráfico nacional y los nueve departamentos coinciden en ${sum.toLocaleString('es-BO')}; se usa la cifra internamente consistente`;
  }

  return [{ year, key: 'BOLIVIA', value: String(sum), excerpt, ...(note ? { note } : {}) }, ...departments];
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
export function seprecRenewalGroups(rows: readonly PdfRow[], totals: readonly SeprecFigure[], where: string): SeprecFigure[] {
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
