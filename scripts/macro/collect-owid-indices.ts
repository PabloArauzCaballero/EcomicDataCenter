import { createHash } from 'node:crypto';
import { REQUESTED_INDICES, type RequestedIndex } from './owid-indices';
import {
  describeSeries,
  mergeIntoSeed,
  plainValue,
  type SeedPoint,
  type SeedSeries,
} from './composite-seed';

/**
 * Captures the composite indices that rate a country rather than measure it.
 *
 * The Human Development Index, the perception of corruption, the strength of
 * the rule of law: none of these is a quantity anyone counted. Each is a
 * construction by an institution that publishes its method, which is exactly
 * why the originator has to travel with the figure. A reader who does not know
 * that the corruption number is Transparency International's survey and not a
 * count of prosecutions cannot read it at all.
 *
 * These arrive through Our World in Data, which redistributes them as one CSV
 * per index with a stable address. That makes it a distributor, not the
 * publisher, and the seed records both: the institution that built the index
 * and the archive the bytes came from. Confusing the two would credit the wrong
 * organisation and send anyone checking the figure to the wrong door.
 *
 * Run with `yarn indices:collect`. The freedom indices that come as workbooks
 * have their own collector and share the seed; see `composite-seed.ts`.
 */

const BASE = 'https://ourworldindata.org/grapher';
const DISTRIBUTOR = 'OUR WORLD IN DATA';
const UA = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';

/** Only Bolivia, and only the years the index actually rates it. */
const COUNTRY_PREFIX = 'Bolivia,BOL,';

async function collectIndex(requested: RequestedIndex, retrievedAt: string): Promise<SeedSeries> {
  const sourceUrl = `${BASE}/${requested.slug}.csv`;
  const response = await fetch(sourceUrl, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    throw new Error(`${requested.slug}: el distribuidor respondio ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const upstreamSha256 = createHash('sha256').update(bytes).digest('hex');

  const lines = bytes.toString('utf-8').split('\n');
  const headings = (lines[0] ?? '').trim().split(',');
  const column = headings.indexOf(requested.column);
  // The column is located by its heading rather than by position: the
  // redistributor adds and removes trailing columns, and reading the wrong one
  // would produce figures that are real numbers and the wrong measurement.
  if (column < 0) {
    throw new Error(`${requested.slug}: no trae la columna «${requested.column}»`);
  }

  const points: SeedPoint[] = [];
  for (const line of lines) {
    if (!line.startsWith(COUNTRY_PREFIX)) continue;
    const fields = line.trim().split(',');
    const period = fields[2] ?? '';
    const value = plainValue(fields[column]);
    if (!/^(?:1[89]|20)\d{2}$/u.test(period) || value === null) continue;
    // Heading row and data row together: on their own a row of bare fields
    // cannot say which column a figure came from, and a reader checking the
    // number would have to trust this script to have counted correctly.
    points.push({
      period,
      value,
      excerpt: `${(lines[0] ?? '').trim()}\n${line.trim()}`,
    });
  }
  points.sort((left, right) => left.period.localeCompare(right.period));
  if (!points.length) throw new Error(`${requested.slug}: sin observaciones para Bolivia`);

  const series: SeedSeries = {
    indicatorCode: requested.indicatorCode,
    name: requested.name,
    unit: requested.unit,
    provenance: {
      publisher: requested.publisher,
      distributor: DISTRIBUTOR,
      sourceUrl,
      valueColumn: requested.column,
      retrievedAt,
      upstreamSha256,
      frequency: 'ANNUAL',
      format: 'CSV',
    },
    points,
  };
  console.log(describeSeries(series));
  return series;
}

async function main(): Promise<void> {
  const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;
  const series: SeedSeries[] = [];
  for (const requested of REQUESTED_INDICES)
    series.push(await collectIndex(requested, retrievedAt));
  const total = mergeIntoSeed(series);
  console.log(`\n${series.length} indices escritos; ${total} series en el catalogo`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'index collection failed'}\n`);
  process.exitCode = 1;
});
