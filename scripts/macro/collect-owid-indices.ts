import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
 * Run with `yarn indices:collect`.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'composite-indices.json');
const BASE = 'https://ourworldindata.org/grapher';
const DISTRIBUTOR = 'OUR WORLD IN DATA';
const UA = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';

interface Requested {
  readonly indicatorCode: string;
  /** Slug of the redistributed dataset, which is also its citable address. */
  readonly slug: string;
  readonly name: string;
  /** Institution that constructs the index, not the one that redistributes it. */
  readonly publisher: string;
  readonly unit: 'INDEX' | 'SCORE';
  /** Heading of the value column, so the wrong column can never be read. */
  readonly column: string;
}

const REQUESTED: readonly Requested[] = [
  {
    indicatorCode: 'HUMAN_DEVELOPMENT_INDEX',
    slug: 'human-development-index',
    name: 'Indice de Desarrollo Humano',
    publisher: 'PROGRAMA DE LAS NACIONES UNIDAS PARA EL DESARROLLO',
    unit: 'INDEX',
    column: 'Human Development Index',
  },
  {
    indicatorCode: 'CORRUPTION_PERCEPTIONS_INDEX',
    slug: 'corruption-perception-index',
    name: 'Indice de Percepcion de la Corrupcion',
    publisher: 'TRANSPARENCY INTERNATIONAL',
    unit: 'INDEX',
    column: 'Corruption Perceptions Index',
  },
  {
    indicatorCode: 'VDEM_RULE_OF_LAW_INDEX',
    slug: 'rule-of-law-index',
    name: 'Indice de estado de derecho',
    publisher: 'V-DEM INSTITUTE',
    unit: 'INDEX',
    column: 'Rule of Law index',
  },
  {
    indicatorCode: 'VDEM_HUMAN_RIGHTS_INDEX',
    slug: 'human-rights-index-vdem',
    name: 'Indice de derechos humanos',
    publisher: 'V-DEM INSTITUTE',
    unit: 'INDEX',
    column: 'Human Rights Index',
  },
  {
    indicatorCode: 'POLITICAL_REGIME_CLASSIFICATION',
    slug: 'political-regime',
    name: 'Clasificacion del regimen politico',
    publisher: 'V-DEM INSTITUTE',
    unit: 'SCORE',
    column: 'Political regime',
  },
  {
    indicatorCode: 'STATE_CAPACITY_INDEX',
    slug: 'state-capacity-index',
    name: 'Indice de capacidad estatal',
    publisher: 'HANSON Y SIGMAN',
    unit: 'SCORE',
    column: 'State Capacity Index',
  },
];

/** Only Bolivia, and only the years the index actually rates it. */
const COUNTRY_PREFIX = 'Bolivia,BOL,';

interface IndexPoint {
  readonly period: string;
  readonly value: string;
  readonly excerpt: string;
}

/**
 * A figure the grounding check can find again.
 *
 * The redistributor writes some values at full floating precision, and an
 * exponent reads as two numbers to the check rather than one, so a value that
 * only renders exponentially is dropped rather than written and left to fail
 * its own evidence downstream.
 */
function plainValue(raw: string): string | null {
  const trimmed = raw.trim();
  return /^-?\d+(?:\.\d+)?$/u.test(trimmed) ? trimmed : null;
}

async function collectIndex(requested: Requested, retrievedAt: string): Promise<unknown> {
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

  const points: IndexPoint[] = [];
  for (const line of lines) {
    if (!line.startsWith(COUNTRY_PREFIX)) continue;
    const fields = line.trim().split(',');
    const period = fields[2] ?? '';
    const value = plainValue(fields[column] ?? '');
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

  console.log(
    `  ${requested.indicatorCode.padEnd(34)} ${String(points.length).padStart(3)} puntos  ` +
      `${points[0]?.period}-${points.at(-1)?.period}  (${requested.publisher})`,
  );

  return {
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
    },
    points,
  };
}

async function main(): Promise<void> {
  const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;
  const series: unknown[] = [];
  for (const requested of REQUESTED) series.push(await collectIndex(requested, retrievedAt));
  writeFileSync(SEED, `${JSON.stringify({ series }, null, 2)}\n`, 'utf-8');
  console.log(`\n${series.length} indices escritos`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'index collection failed'}\n`);
  process.exitCode = 1;
});
