import { createHash } from 'node:crypto';
import {
  describeSeries,
  mergeIntoSeed,
  plainValue,
  type SeedPoint,
  type SeedSeries,
} from './composite-seed';
import {
  FRASER_FREEDOM,
  FREEDOM_HOUSE_RATINGS,
  FREEDOM_HOUSE_SCORES,
  type WorkbookSource,
} from './freedom-indices';
import { Workbook } from './xlsx-cells';

/**
 * Captures the freedom indices — political from Freedom House, economic from
 * the Fraser Institute — from the workbooks their publishers release.
 *
 * Each figure is written with the row it came from, restated as a heading
 * line and a value line so the boot loader can check that the value sits under
 * the column the seed names. That is the same evidence a CSV row gives; the
 * only thing a workbook changes is that the columns have to be read by their
 * letter first and their heading second.
 *
 * Run with `yarn freedom:collect`. Shares the seed with `indices:collect`.
 */

const UA = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';
const COUNTRY = 'Bolivia';
const YEAR = /^(?:1[89]|20)\d{2}$/u;

async function download(url: string): Promise<{ bytes: Buffer; sha256: string }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`${url}: el editor respondio ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/** The column letter after this one: Z is followed by AA, as the sheet counts. */
function nextColumn(column: string): string {
  const digits = column.split('');
  let index = digits.length - 1;
  while (index >= 0) {
    if (digits[index] !== 'Z') {
      digits[index] = String.fromCharCode((digits[index] ?? 'A').charCodeAt(0) + 1);
      return digits.join('');
    }
    digits[index] = 'A';
    index -= 1;
  }
  return `A${digits.join('')}`;
}

function bySeries(
  source: WorkbookSource,
  sha256: string,
  retrievedAt: string,
  points: ReadonlyMap<string, SeedPoint[]>,
): SeedSeries[] {
  return source.series.map((series) => {
    const own = [...(points.get(series.indicatorCode) ?? [])].sort((left, right) =>
      left.period.localeCompare(right.period),
    );
    if (!own.length) throw new Error(`${series.indicatorCode}: sin lecturas para Bolivia`);
    return {
      indicatorCode: series.indicatorCode,
      name: series.name,
      unit: series.unit,
      provenance: {
        publisher: source.publisher,
        distributor: source.publisher,
        sourceUrl: source.sourceUrl,
        valueColumn: series.column,
        retrievedAt,
        upstreamSha256: sha256,
        frequency: 'ANNUAL',
        format: 'XLSX',
      },
      points: own,
    };
  });
}

/**
 * A sheet with one heading row and one row per country and edition.
 *
 * `periodShift` is how an edition year becomes the year it describes: Freedom
 * House's 2024 edition rates 2023, and filing it under 2024 would put every
 * reading a year late beside the series that do carry the calendar year.
 */
function collectTabular(
  source: WorkbookSource,
  workbook: Workbook,
  sha256: string,
  retrievedAt: string,
  columns: { country: string; period: string; periodShift: number; excerptUpTo?: string },
): SeedSeries[] {
  const rows = workbook.rows(source.sheet);
  const header = rows.find((row) => [...row.values()].includes(columns.country));
  if (!header) throw new Error(`${source.sheet}: sin fila de cabecera`);
  const letters = [...header.keys()].filter(
    (letter) =>
      !columns.excerptUpTo ||
      letter.length < columns.excerptUpTo.length ||
      letter <= columns.excerptUpTo,
  );
  const letterOf = (heading: string): string => {
    const found = [...header.entries()].find(([, text]) => text === heading)?.[0];
    if (!found) throw new Error(`${source.sheet}: no trae la columna «${heading}»`);
    return found;
  };
  const heading = letters.map((letter) => header.get(letter) ?? '').join(',');
  const countryLetter = letterOf(columns.country);
  const periodLetter = letterOf(columns.period);

  const points = new Map<string, SeedPoint[]>();
  for (const row of rows) {
    if (row.get(countryLetter) !== COUNTRY) continue;
    const edition = row.get(periodLetter) ?? '';
    if (!YEAR.test(edition)) continue;
    const period = String(Number(edition) + columns.periodShift);
    const excerpt = `${heading}\n${letters.map((letter) => row.get(letter) ?? '').join(',')}`;
    for (const series of source.series) {
      const value = plainValue(row.get(letterOf(series.column)));
      if (value === null) continue;
      points.set(series.indicatorCode, [
        ...(points.get(series.indicatorCode) ?? []),
        { period, value, excerpt },
      ]);
    }
  }
  return bySeries(source, sha256, retrievedAt, points);
}

/**
 * The ratings sheet, laid out sideways: one row per country, and for every
 * edition three columns — PR, CL, status — under a heading that names the
 * years the edition reviewed. The year filed is the last one that heading
 * names, because an edition that reviewed «Nov.1983-Nov.1984» is the 1984
 * reading and nothing earlier.
 */
function collectRatings(
  source: WorkbookSource,
  workbook: Workbook,
  sha256: string,
  retrievedAt: string,
): SeedSeries[] {
  const rows = workbook.rows(source.sheet);
  const reviewed = rows.find((row) => row.get('A') === 'Year(s) Under Review');
  const country = rows.find((row) => row.get('A') === COUNTRY);
  if (!reviewed || !country) throw new Error(`${source.sheet}: sin cabecera de años o sin Bolivia`);

  const heading = 'Country/Territory,Year(s) under review,PR rating,CL rating,Status';
  const points = new Map<string, SeedPoint[]>();
  const add = (code: string, point: SeedPoint): void =>
    void points.set(code, [...(points.get(code) ?? []), point]);
  for (const [letter, label] of reviewed.entries()) {
    if (letter === 'A') continue;
    const years = label.match(/(?:1[89]|20)\d{2}/gu);
    const period = years?.at(-1);
    if (!period) continue;
    const civilLetter = nextColumn(letter);
    const statusLetter = nextColumn(civilLetter);
    const political = plainValue(country.get(letter));
    const civil = plainValue(country.get(civilLetter));
    const status = country.get(statusLetter) ?? '';
    const excerpt = `${heading}\n${COUNTRY},${label},${political ?? ''},${civil ?? ''},${status}`;
    if (political !== null)
      add('FH_POLITICAL_RIGHTS_RATING', { period, value: political, excerpt });
    if (civil !== null) add('FH_CIVIL_LIBERTIES_RATING', { period, value: civil, excerpt });
  }
  return bySeries(source, sha256, retrievedAt, points);
}

async function collect(
  source: WorkbookSource,
  read: (workbook: Workbook, sha256: string) => SeedSeries[],
): Promise<SeedSeries[]> {
  const { bytes, sha256 } = await download(source.sourceUrl);
  const series = read(new Workbook(bytes), sha256);
  for (const one of series) console.log(describeSeries(one));
  return series;
}

async function main(): Promise<void> {
  const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;
  const scored = await collect(FREEDOM_HOUSE_SCORES, (workbook, sha256) =>
    collectTabular(FREEDOM_HOUSE_SCORES, workbook, sha256, retrievedAt, {
      country: 'Country/Territory',
      period: 'Edition',
      periodShift: -1,
    }),
  );
  const rated = await collect(FREEDOM_HOUSE_RATINGS, (workbook, sha256) =>
    collectRatings(FREEDOM_HOUSE_RATINGS, workbook, sha256, retrievedAt),
  );
  const economic = await collect(FRASER_FREEDOM, (workbook, sha256) =>
    collectTabular(FRASER_FREEDOM, workbook, sha256, retrievedAt, {
      country: 'Countries',
      period: 'Year',
      periodShift: 0,
      // Up to the fifth area: the income classification further right carries
      // a comma in its heading, and a comma inside a heading breaks the row a
      // reader checks the value against.
      excerptUpTo: 'I',
    }),
  );
  const series = [...scored, ...rated, ...economic];
  const total = mergeIntoSeed(series);
  console.log(`\n${series.length} indices escritos; ${total} series en el catalogo`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'freedom collection failed'}\n`);
  process.exitCode = 1;
});
