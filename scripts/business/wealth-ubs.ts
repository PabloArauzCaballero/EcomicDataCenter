import { UBS, WEALTH_PREFIX, type DatabookColumn } from './wealth-sources';
import { download, type SeriesBook } from './business-common';
import { cells, pdfRows, type PdfRow } from './pdf-rows';

/**
 * La riqueza de los hogares bolivianos según el Databook de UBS.
 *
 * El cuadro 2-2 trae una página por año y Bolivia cae siempre en la misma
 * posición, pero las columnas se leen por su `x` y no por el orden de los
 * trozos: en la versión de texto corrido la celda vacía de un año desplaza el
 * resto y la mediana termina leída como deuda. Antes de leer, se comprueba que
 * la página sea la del año que se espera, porque si la maquetación se corre un
 * pliego se leería 2005 como 2004 sin que nada se queje.
 */

interface Measure {
  readonly column: string;
  readonly code: string;
  readonly unit: string;
  readonly measure: string;
}

const ESTIMATES: readonly Measure[] = [
  {
    column: 'ADULTS',
    code: 'ADULTS_THOUSAND',
    unit: 'THOUSAND_PERSONS',
    measure: 'Población adulta (miles)',
  },
  {
    column: 'TOTAL',
    code: 'TOTAL_WEALTH_BN_USD',
    unit: 'BILLION_USD',
    measure: 'Riqueza total de los hogares (miles de millones de USD)',
  },
  {
    column: 'MEAN',
    code: 'MEAN_PER_ADULT_USD',
    unit: 'USD',
    measure: 'Riqueza media por adulto (USD)',
  },
  {
    column: 'MEDIAN',
    code: 'MEDIAN_PER_ADULT_USD',
    unit: 'USD',
    measure: 'Riqueza mediana por adulto (USD)',
  },
  {
    column: 'FINANCIAL',
    code: 'FINANCIAL_PER_ADULT_USD',
    unit: 'USD',
    measure: 'Activos financieros por adulto (USD)',
  },
  {
    column: 'NONFINANCIAL',
    code: 'NONFINANCIAL_PER_ADULT_USD',
    unit: 'USD',
    measure: 'Activos no financieros por adulto (USD)',
  },
  { column: 'DEBTS', code: 'DEBTS_PER_ADULT_USD', unit: 'USD', measure: 'Deudas por adulto (USD)' },
];

const PATTERN: readonly Measure[] = [
  {
    column: 'UNDER_10K',
    code: 'ADULTS_UNDER_10K_PCT',
    unit: 'PERCENT',
    measure: 'Adultos con menos de USD 10.000 (%)',
  },
  {
    column: 'FROM_10K_TO_100K',
    code: 'ADULTS_10K_100K_PCT',
    unit: 'PERCENT',
    measure: 'Adultos con USD 10.000 a 100.000 (%)',
  },
  {
    column: 'FROM_100K_TO_1M',
    code: 'ADULTS_100K_1M_PCT',
    unit: 'PERCENT',
    measure: 'Adultos con USD 100.000 a 1 millón (%)',
  },
  {
    column: 'OVER_1M',
    code: 'ADULTS_OVER_1M_PCT',
    unit: 'PERCENT',
    measure: 'Adultos con más de USD 1 millón (%)',
  },
  {
    column: 'GINI',
    code: 'GINI_PCT',
    unit: 'PERCENT',
    measure: 'Coeficiente de Gini de la riqueza (%)',
  },
];

const BASIS =
  'Estimación de fin de año de UBS (antes Credit Suisse), en dólares corrientes. Para Bolivia el método es una regresión sobre países con encuestas: es un modelo, no una medición del patrimonio de los hogares.';

/** La fila de Bolivia en una página, cortada por columnas, con su cita. */
function marketRow(
  rows: readonly PdfRow[],
  page: number,
  title: string,
  columns: readonly DatabookColumn[],
): { values: Map<string, string>; excerpt: string } {
  const own = rows.filter((row) => row.page === page);
  if (!own.some((row) => row.text.includes(title))) {
    throw new Error(`Databook p. ${page}: se esperaba «${title}» y la página es otra`);
  }
  const row = own.find((candidate) => candidate.glyphs[0]?.text === UBS.market);
  if (!row) throw new Error(`Databook p. ${page}: falta la fila de ${UBS.market}`);
  const read = cells(
    row,
    columns.map((column) => [column.from, column.to] as const),
  );
  const values = new Map(columns.map((column, index) => [column.key, read[index] ?? '']));
  const quoted: Record<string, string> = { table: title, Market: UBS.market };
  columns.forEach((column, index) => {
    quoted[column.label] = read[index] ?? '';
  });
  return { values, excerpt: JSON.stringify(quoted) };
}

export async function collectUbs(book: SeriesBook): Promise<string[]> {
  const file = await download(UBS.url);
  const { firstPage, step, firstYear, lastYear } = UBS.estimates;
  const pages: number[] = [];
  for (let year = firstYear; year <= lastYear; year += 1)
    pages.push(firstPage + (year - firstYear) * step);
  const rows = await pdfRows(file.bytes, [...pages, UBS.pattern.page]);
  const notes: string[] = [];

  const add = (measure: Measure, year: number, printed: string, excerpt: string): void => {
    if (!/^\d[\d,]*(?:\.\d+)?$/u.test(printed)) {
      notes.push(`Databook ${year}: ${measure.code} sin cifra («${printed}»)`);
      return;
    }
    book.add(
      {
        indicatorCode: `${WEALTH_PREFIX}UBS_${measure.code}`,
        name: `Bolivia: ${measure.measure.toLowerCase()} según UBS`,
        group: 'BOLIVIA',
        groupLabel: 'Bolivia',
        measure: measure.measure,
        level: 'COUNTRY',
        unit: measure.unit,
        basis: BASIS,
        publisher: UBS.publisher,
      },
      {
        period: String(year),
        value: printed.replace(/,/gu, ''),
        excerpt,
        sourceUrl: UBS.url,
        upstreamSha256: file.sha256,
        retrievedAt: file.retrievedAt,
      },
    );
  };

  for (let year = firstYear; year <= lastYear; year += 1) {
    const page = firstPage + (year - firstYear) * step;
    const title = `Table 2-2: Wealth estimates by market (end-${year})`;
    const { values, excerpt } = marketRow(rows, page, title, UBS.estimateColumns);
    for (const measure of ESTIMATES) add(measure, year, values.get(measure.column) ?? '', excerpt);
  }

  const { page, year } = UBS.pattern;
  const title = `Table 3-1: Wealth pattern within markets, ${year}`;
  const { values, excerpt } = marketRow(rows, page, title, UBS.patternColumns);
  if (values.get('TOTAL') !== '100')
    throw new Error(`Databook p. ${page}: los tramos no suman 100`);
  for (const measure of PATTERN) add(measure, year, values.get(measure.column) ?? '', excerpt);
  return notes;
}
