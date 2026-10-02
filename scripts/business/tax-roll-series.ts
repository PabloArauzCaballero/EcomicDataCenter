import type { RegisterSeries } from '../macro/annual-register-shape';
import type { SeriesBook } from './business-common';
import { DEPARTMENTS, codeOf, type Downloaded } from './business-common';
import { folded, plainNumber } from './tax-geometry';
import type { Stated } from './tax-notes';
import type { RollBlock, RollColumn, RollRow } from './tax-roll-parse';
import { ROLL_PREFIX, TAX_PUBLISHER, WEALTH_PREFIX, type TaxEdition } from './tax-sources';

/**
 * Las series del padrón y las de Grandes Fortunas.
 *
 * El padrón cuenta contribuyentes, no empresas: una persona natural con NIT
 * cuenta igual que una sociedad anónima. Por eso el tablero lo muestra al lado
 * del registro de comercio y no en su lugar. Lo que el cuadro sí tiene y nadie
 * más publica es el contraste: dos centésimos del padrón (los PRICO) pagan más
 * de cuatro décimos de lo que se recauda.
 */

type Level = RegisterSeries['level'];

const DIMENSIONS: Readonly<
  Record<Exclude<RollBlock, 'TOTAL'>, { code: string; level: Level; title: string }>
> = {
  CAT: { code: 'CAT', level: 'SIZE', title: 'Categoría de contribuyente' },
  PERSON: { code: 'PERSON', level: 'LEGAL_FORM', title: 'Tipo de persona' },
  DEPT: { code: 'DEPT', level: 'DEPARTMENT', title: 'Departamento (domicilio fiscal)' },
  ACT: { code: 'ACT', level: 'ACTIVITY', title: 'Once actividades y regímenes especiales' },
  ACTD: { code: 'ACTD', level: 'ACTIVITY', title: 'Actividades que más recaudan' },
};

const DEPARTMENT_KEYS = new Map(
  Object.entries(DEPARTMENTS).map(([key, name]) => [folded(name), key] as const),
);
const CANONICAL: Readonly<Record<string, string>> = {
  PRICO: 'PRICO (principales contribuyentes)',
  GRACO: 'GRACO (grandes contribuyentes)',
  RESTO: 'Resto de contribuyentes',
  'REGIMENES ESPECIALES': 'Regímenes especiales',
  'REGIMEN GENERAL': 'Régimen general',
};

/**
 * El tipo de persona con un solo código: unas ediciones escriben «Empresa
 * unipersonal» y otras «Empresas Unipersonales», y es la misma fila.
 */
const PERSONS: readonly (readonly [RegExp, string, string])[] = [
  [/UNIPERSONAL/u, 'EMPRESA_UNIPERSONAL', 'Empresa unipersonal'],
  [/NATURAL/u, 'PERSONA_NATURAL', 'Persona natural'],
  [/JURIDICA/u, 'PERSONA_JURIDICA', 'Persona jurídica'],
  [/SUCESION/u, 'SUCESION_INDIVISA', 'Sucesión indivisa'],
];
const personOf = (label: string): readonly [RegExp, string, string] | undefined =>
  PERSONS.find(([pattern]) => pattern.test(folded(label)));
const personKey = (label: string): string => personOf(label)?.[1] ?? codeOf(label, 40);

/** El rótulo para el tablero: el departamento como lo escribe el corpus, lo demás en oración. */
function presentable(row: RollRow): string {
  const key = folded(row.label);
  if (row.block === 'DEPT') return DEPARTMENTS[DEPARTMENT_KEYS.get(key) ?? ''] ?? row.label;
  if (row.block === 'PERSON') return personOf(row.label)?.[2] ?? row.label;
  if (CANONICAL[key]) return CANONICAL[key] ?? row.label;
  const lower = row.label.toLocaleLowerCase('es');
  return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
}

const BASIS = {
  rollPct:
    'Parte del padrón de contribuyentes activos al cierre (2025: a octubre). Cuenta contribuyentes con NIT, personas naturales incluidas: no es un conteo de empresas.',
  revenuePct:
    'Parte de la recaudación de Mercado Interno sin ITF, IEHD ni IDH (2013-2014: con IDH e IEHD), según la nota del cuadro. 2025: enero a octubre.',
  count:
    'Contribuyentes activos de la categoría a diciembre, según el cuadro por categoría de 2013-2014.',
  revenue:
    'Recaudación de la categoría en millones de Bs, con IDH e IEHD, según el cuadro por categoría de 2013-2014.',
} as const;

const UNITS: Readonly<Record<RollColumn, string>> = {
  rollPct: 'PERCENT',
  revenuePct: 'PERCENT',
  count: 'COUNT',
  revenue: 'MILLION_BOB',
};
const CODES: Readonly<Record<RollColumn, string>> = {
  rollPct: 'ROLL_PCT',
  revenuePct: 'REVENUE_PCT',
  count: 'COUNT',
  revenue: 'REVENUE',
};
const MEASURES: Readonly<Record<RollColumn, string>> = {
  rollPct: 'participación en el padrón',
  revenuePct: 'participación en la recaudación',
  count: 'contribuyentes activos',
  revenue: 'recaudación',
};

/** Una edición del padrón leída. */
export interface RollRead {
  readonly edition: TaxEdition;
  readonly doc: Downloaded;
  readonly rows: readonly RollRow[];
  readonly coverage: string;
}

function excerptOf(read: RollRead, row: RollRow): string {
  const total = row.block === 'TOTAL';
  return JSON.stringify({
    memoria: read.edition.title,
    cuadro: 'Características del padrón de contribuyentes y recaudación',
    cobertura: read.coverage,
    pagina: String(row.page),
    variable: total ? row.label.replace(/^(total\*?(?:\s+\d{4})?\*?).*$/iu, '$1') : row.label,
    // En la fila del total de los cuadros de dos columnas la primera trae la
    // cuenta de contribuyentes y la segunda la recaudación: se nombran así.
    ...(row.cells.count ? { contribuyentes: row.cells.count } : {}),
    ...(row.cells.rollPct
      ? { [total && !row.cells.count ? 'contribuyentes' : 'part_padron']: row.cells.rollPct }
      : {}),
    ...(row.cells.revenue ? { recaudacion_mm_bs: row.cells.revenue } : {}),
    ...(row.cells.revenuePct
      ? {
          [total && !row.cells.revenue ? 'recaudacion_mm_bs' : 'part_recaudacion']:
            row.cells.revenuePct,
        }
      : {}),
  });
}

/** Las series de una edición del cuadro del padrón. */
export function rollSeries(read: RollRead, book: SeriesBook): void {
  const base = { publisher: TAX_PUBLISHER, frequency: 'ANNUAL' as const };
  const point = (row: RollRow, value: string) => ({
    period: String(read.edition.year),
    value,
    excerpt: excerptOf(read, row),
    sourceUrl: read.edition.url,
    upstreamSha256: read.doc.sha256,
    retrievedAt: read.doc.retrievedAt,
  });
  for (const row of read.rows) {
    if (row.block === 'TOTAL') {
      totalSeries(row, book, point);
      continue;
    }
    const dimension = DIMENSIONS[row.block];
    const key =
      row.block === 'DEPT'
        ? (DEPARTMENT_KEYS.get(folded(row.label)) ?? codeOf(row.label))
        : row.block === 'PERSON'
          ? personKey(row.label)
          : codeOf(row.label, 40);
    const label = presentable(row);
    const general = row.block === 'CAT' && folded(row.label) === 'REGIMEN GENERAL';
    for (const [column, printed] of Object.entries(row.cells) as [RollColumn, string][]) {
      book.add(
        {
          ...base,
          indicatorCode: `${ROLL_PREFIX}${CODES[column]}_${dimension.code}_${key}`,
          name: `${label}: ${MEASURES[column]}`.slice(0, 200),
          group: key,
          groupLabel: label.slice(0, 120),
          measure: `${dimension.title}: ${MEASURES[column]}`.slice(0, 120),
          // El régimen general es PRICO más GRACO más Resto: sumarlo con ellos lo cuenta dos veces.
          level: general ? 'AGGREGATE' : dimension.level,
          unit: UNITS[column],
          basis: BASIS[column],
        },
        point(row, plainNumber(printed)),
      );
    }
  }
}

/** La fila del total: cuántos contribuyentes activos y cuánto se recaudó en el año. */
function totalSeries(
  row: RollRow,
  book: SeriesBook,
  point: (row: RollRow, value: string) => RegisterSeries['points'][number],
): void {
  const count = row.cells.count ?? row.cells.rollPct;
  const amount = row.cells.revenue ?? row.cells.revenuePct;
  if (!count || !amount || count.endsWith('%') || amount.endsWith('%')) {
    throw new Error(`la fila del total no trae cuenta y monto: ${JSON.stringify(row.cells)}`);
  }
  const head = {
    group: 'BOLIVIA',
    groupLabel: 'Bolivia',
    level: 'COUNTRY' as const,
    publisher: TAX_PUBLISHER,
  };
  book.add(
    {
      ...head,
      indicatorCode: `${ROLL_PREFIX}ACTIVE_TAXPAYERS`,
      name: 'Bolivia: contribuyentes activos en el padrón',
      measure: 'Contribuyentes activos en el padrón nacional',
      unit: 'COUNT',
      basis:
        'Contribuyentes con NIT activo al cierre de la gestión (2025: a octubre), personas naturales incluidas; no es un conteo de empresas.',
    },
    point(row, plainNumber(count)),
  );
  book.add(
    {
      ...head,
      indicatorCode: `${ROLL_PREFIX}REVENUE_TOTAL`,
      name: 'Bolivia: recaudación total del cuadro del padrón',
      measure: 'Recaudación total que imprime el cuadro del padrón',
      unit: 'MILLION_BOB',
      basis:
        'Total del cuadro: Mercado Interno, ITF, IEHD e IDH en millones de Bs, según su nota. 2025: enero a octubre.',
    },
    point(row, plainNumber(amount)),
  );
}

/** Las dos series de Grandes Fortunas, con un punto por edición que las dice. */
export function wealthSeries(
  edition: TaxEdition,
  doc: Downloaded,
  payers: Stated | undefined,
  collected: Stated | undefined,
  book: SeriesBook,
): void {
  const head = {
    group: 'IGF',
    groupLabel: 'Impuesto a las Grandes Fortunas',
    level: 'COUNTRY' as const,
    publisher: TAX_PUBLISHER,
  };
  const point = (stated: Stated) => ({
    period: String(edition.year),
    value: stated.figure,
    // El extracto lleva la oración y, aparte, la cifra tal como se imprime:
    // la memoria la pega al «Bs» y así no se reconoce como número.
    excerpt: JSON.stringify({
      memoria: edition.title,
      texto: stated.sentence,
      cifra: stated.printed,
    }),
    sourceUrl: edition.url,
    upstreamSha256: doc.sha256,
    retrievedAt: doc.retrievedAt,
  });
  if (payers) {
    book.add(
      {
        ...head,
        indicatorCode: `${WEALTH_PREFIX}IGF_PAYERS`,
        name: 'Impuesto a las Grandes Fortunas: contribuyentes inscritos',
        measure: 'Contribuyentes inscritos en el Impuesto a las Grandes Fortunas',
        unit: 'COUNT',
        basis:
          'Inscritos en el padrón del IGF al cierre de la gestión (2025: al 31 de octubre), según el párrafo de la memoria. No son los que pagaron.',
      },
      point(payers),
    );
  }
  if (collected) {
    book.add(
      {
        ...head,
        indicatorCode: `${WEALTH_PREFIX}IGF_COLLECTED_BOB`,
        name: 'Impuesto a las Grandes Fortunas: recaudación',
        measure: 'Recaudado por el Impuesto a las Grandes Fortunas',
        unit: 'BOB',
        basis:
          'Bolivianos recaudados en la gestión, como los dice el párrafo de la memoria (2025: al 31 de octubre).',
      },
      point(collected),
    );
  }
}
