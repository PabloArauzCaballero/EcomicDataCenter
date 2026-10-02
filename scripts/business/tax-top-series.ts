import type { RegisterPoint } from '../macro/annual-register-shape';
import { companyIdentity, type Downloaded, type SeriesBook } from './business-common';
import { plainNumber } from './tax-geometry';
import { canonicalNames } from './tax-names';
import type { Stated } from './tax-notes';
import { TAX_PUBLISHER, TOP_PREFIX, type TaxEdition } from './tax-sources';
import type { TopRow } from './tax-top-parse';

/**
 * Las series del ránking: puesto, impuesto pagado y participación por empresa.
 *
 * Cada fila del cuadro trae dos gestiones. La propia es la que da el puesto y
 * se publica; la anterior sólo se usa para llenar un año cuya memoria no
 * existe (2011, que no está publicada): ahí entra el pagado y la participación
 * de las empresas que siguen entre las cien del año siguiente, nunca un puesto,
 * porque el ránking de ese año no se puede reconstruir desde una lista que no
 * lo ordena.
 */

/** Una edición leída: sus filas, los atributos de los anexos y la nota de cobertura. */
export interface TopRead {
  readonly edition: TaxEdition;
  readonly doc: Downloaded;
  readonly rows: readonly TopRow[];
  readonly attributes: ReadonlyMap<number, Readonly<Record<string, string>>>;
  readonly coverage: (Stated & { page: number }) | undefined;
}

/**
 * Qué par de columnas es la gestión del cuadro: la que no sube al bajar en el
 * ránking. No se exige perfección porque la fuente no la tiene: la memoria 2022
 * imprime en los puestos 66 y 67 las cifras de los puestos 63 y 64, y el 65 queda
 * por encima del 64. Gana el par que sube en a lo sumo tres puestos cuando el
 * otro sube en muchos más; las subidas se devuelven para el informe.
 */
export function currentPair(
  rows: readonly TopRow[],
  where: string,
): { pair: 0 | 2; rises: string[] } {
  const rises = (index: 0 | 2): string[] =>
    rows
      .filter((row, at) => {
        const above = rows[at - 1];
        if (!above || !row.cells[index] || !above.cells[index]) return !row.cells[index];
        return Number(plainNumber(row.cells[index])) > Number(plainNumber(above.cells[index]));
      })
      .map((row) => `${row.rank}: ${row.cells[index] || 'vacío'}`);
  const left = rises(0);
  const right = rises(2);
  const pair = left.length < right.length ? 0 : 2;
  const winner = pair === 0 ? left : right;
  const loser = pair === 0 ? right : left;
  if (winner.length > 3 || loser.length < winner.length + 5) {
    throw new Error(
      `${where}: no se sabe qué par es la gestión (sube a la izquierda en ${left.slice(0, 4).join(', ')}; a la derecha en ${right.slice(0, 4).join(', ')})`,
    );
  }
  return { pair, rises: winner };
}

/** La fila como la imprime la memoria, con los nombres de sus columnas en su orden. */
function excerptOf(read: TopRead, row: TopRow, pair: 0 | 2): string {
  const year = read.edition.year;
  const [first, second, third, fourth] = row.cells;
  // El cuadro imprime primero la gestión propia o la anterior según la edición;
  // las claves siguen el orden impreso.
  const left = pair === 0 ? year : year - 1;
  const right = pair === 0 ? year - 1 : year;
  return JSON.stringify({
    memoria: read.edition.title,
    cuadro: 'Las 100 empresas que más impuestos pagaron (millones de Bs)',
    pagina: String(row.page),
    puesto: String(row.rank),
    contribuyente: row.company,
    departamento: row.department,
    [`total_${left}`]: first,
    [`part_${left}`]: second,
    [`total_${right}`]: third,
    [`part_${right}`]: fourth,
  });
}

type Kind = 'rank' | 'paid' | 'share';

const BASIS = {
  rank: 'Puesto por impuesto pagado al SIN en la gestión (IVA, IT, IUE, ICE, IEHD, IDH y otros; sin ITF), no por ventas ni utilidades. 2025 cubre enero a octubre.',
  paid: 'Impuesto pagado en la gestión, millones de Bs corrientes, efectivo y valores imputados, sin ITF. Es lo que la empresa pagó, no lo que vendió. 2025 cubre enero a octubre.',
  share:
    'Participación de lo pagado por la empresa en la recaudación total de la gestión, calculada por el SIN. 2025 cubre enero a octubre.',
  filled:
    ' El punto 2011 sale de la columna de comparación de la Memoria 2012 (no hay Memoria 2011 publicada).',
} as const;

const MEASURES: Readonly<Record<Kind, string>> = {
  rank: 'puesto entre los cien que más impuestos pagaron',
  paid: 'impuesto pagado',
  share: 'participación en la recaudación total',
};
const CODES: Readonly<Record<Kind, string>> = { rank: 'RANK', paid: 'PAID', share: 'SHARE' };
const UNITS: Readonly<Record<Kind, string>> = {
  rank: 'RANK',
  paid: 'MILLION_BOB',
  share: 'PERCENT',
};

/** Las series de empresa de todas las ediciones, y lo que se llenó con la columna anterior. */
export function topSeries(
  reads: readonly TopRead[],
  book: SeriesBook,
): { filled: number; anomalies: string[] } {
  const years = new Set(reads.map((read) => read.edition.year));
  const canonical = canonicalNames(
    reads.flatMap((read) =>
      read.rows.map((row) => ({ name: row.company, year: read.edition.year })),
    ),
  );
  const latest = new Map<string, { name: string; attributes: Record<string, string> }>();
  const points: { slug: string; kind: Kind; point: RegisterPoint; filled: boolean }[] = [];
  let filled = 0;
  const anomalies: string[] = [];
  for (const read of [...reads].sort((left, right) => left.edition.year - right.edition.year)) {
    const { pair, rises } = currentPair(read.rows, read.edition.title);
    if (rises.length > 0) anomalies.push(`${read.edition.year} sube en ${rises.join(', ')}`);
    for (const row of read.rows) {
      const { slug, name } = companyIdentity(canonical.get(row.company) ?? row.company);
      const attributes: Record<string, string> = { ...(latest.get(slug)?.attributes ?? {}) };
      if (row.department) attributes['departamento'] = row.department;
      Object.assign(attributes, read.attributes.get(row.rank) ?? {});
      latest.set(slug, { name, attributes });
      const point = (period: number, value: string): RegisterPoint => ({
        period: String(period),
        value,
        excerpt: excerptOf(read, row, pair),
        sourceUrl: read.edition.url,
        upstreamSha256: read.doc.sha256,
        retrievedAt: read.doc.retrievedAt,
      });
      const [paid, share, previousPaid, previousShare] =
        pair === 0 ? row.cells : [row.cells[2], row.cells[3], row.cells[0], row.cells[1]];
      points.push({
        slug,
        kind: 'rank',
        point: point(read.edition.year, String(row.rank)),
        filled: false,
      });
      points.push({
        slug,
        kind: 'paid',
        point: point(read.edition.year, plainNumber(paid)),
        filled: false,
      });
      points.push({
        slug,
        kind: 'share',
        point: point(read.edition.year, plainNumber(share)),
        filled: false,
      });
      const before = read.edition.year - 1;
      if (!years.has(before) && previousPaid && previousShare) {
        points.push({
          slug,
          kind: 'paid',
          point: point(before, plainNumber(previousPaid)),
          filled: true,
        });
        points.push({
          slug,
          kind: 'share',
          point: point(before, plainNumber(previousShare)),
          filled: true,
        });
        filled += 1;
      }
    }
  }
  const withFill = new Set(
    points.filter((one) => one.filled).map((one) => `${one.slug}|${one.kind}`),
  );
  for (const { slug, kind, point } of points) {
    const { name, attributes } = latest.get(slug) ?? { name: slug, attributes: {} };
    const tags = Object.entries(attributes).map(([key, text]) => `${key}=${text}`);
    const suffix = tags.length > 0 ? ` {${tags.join('; ')}}` : '';
    const measure = MEASURES[kind];
    book.add(
      {
        indicatorCode: `${TOP_PREFIX}${CODES[kind]}_${slug}`,
        name: `${name}: ${measure}${suffix}`.slice(0, 200),
        group: slug,
        groupLabel: name,
        measure: measure.charAt(0).toUpperCase() + measure.slice(1),
        level: 'COMPANY',
        unit: UNITS[kind],
        basis: BASIS[kind] + (withFill.has(`${slug}|${kind}`) ? BASIS.filled : ''),
        publisher: TAX_PUBLISHER,
      },
      point,
    );
  }
  return { filled, anomalies };
}

/** La parte de la recaudación que hicieron las cien, una por edición. */
export function coverageSeries(reads: readonly TopRead[], book: SeriesBook): number[] {
  const missing: number[] = [];
  for (const read of reads) {
    if (!read.coverage) {
      missing.push(read.edition.year);
      continue;
    }
    book.add(
      {
        indicatorCode: `${TOP_PREFIX}COVERAGE_PCT`,
        name: 'Las 100 empresas que más impuestos pagaron: parte de la recaudación',
        group: 'TOP_100',
        groupLabel: 'Las 100 empresas que más impuestos pagaron',
        measure: 'Parte de la recaudación total pagada por las cien',
        level: 'AGGREGATE',
        unit: 'PERCENT',
        basis:
          'Lo que dice la nota al pie del ránking: parte de la recaudación de la gestión que pagaron las cien empresas listadas. Las cien cambian de un año a otro. 2025 cubre enero a octubre.',
        publisher: TAX_PUBLISHER,
      },
      {
        period: String(read.edition.year),
        value: read.coverage.figure,
        excerpt: JSON.stringify({
          memoria: read.edition.title,
          pagina: String(read.coverage.page),
          nota: read.coverage.sentence,
        }),
        sourceUrl: read.edition.url,
        upstreamSha256: read.doc.sha256,
        retrievedAt: read.doc.retrievedAt,
      },
    );
  }
  return missing;
}
