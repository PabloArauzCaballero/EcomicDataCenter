import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MANIFEST, type Requested } from './worldbank-series';
import { SOCIAL_MANIFEST } from './worldbank-social-series';

/**
 * Captures annual series from the multilateral compiler into versioned seeds.
 *
 * The observatory already carried the compiler's headline aggregates. What it
 * did not carry was the block a reader asks for when the question is about
 * money rather than about output: what credit costs, what the banks are worth,
 * and whether they are covered against the loans that stopped paying. Those
 * live in the same catalogue under different families, so this collects them
 * the same way the aggregates were collected rather than by hand.
 *
 * One retrieval per indicator, each with its own citable URL and digest, so a
 * reader can re-request exactly the series a figure came from. The digest is
 * taken over the bytes the compiler answered with, and the excerpt kept beside
 * every point is that point's own record, which is what makes the figure
 * re-checkable without trusting this script.
 *
 * Run with `yarn macro:collect`.
 */

const BASE = 'https://api.worldbank.org/v2/country/BOL/indicator';
/** Widest range the compiler holds for Bolivia, fixed so the URL stays stable. */
const RANGE = '1960:2026';
const UA = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';
const SEED_DIR = join('src', 'database', 'seeds', 'boot');

interface CompilerPoint {
  readonly date: string;
  readonly value: number | null;
}

interface SeriesPoint {
  readonly period: string;
  readonly value: string;
  readonly excerpt: string;
}

/**
 * A figure the grounding check can find again.
 *
 * The check reads numbers out of the excerpt and matches them one by one, and
 * an exponent is two numbers to it, not one. A value that only renders in
 * exponential notation would therefore fail its own evidence, so it is dropped
 * with a warning rather than written and left to break the loader.
 */
function plainValue(value: number): string | null {
  const rendered = String(value);
  return /^-?\d+(?:\.\d+)?$/u.test(rendered) ? rendered : null;
}

async function collectSeries(requested: Requested, retrievedAt: string): Promise<unknown> {
  const collection = requested.source === undefined ? '' : `&source=${requested.source}`;
  const sourceUrl = `${BASE}/${requested.worldBankCode}?format=json&per_page=200&date=${RANGE}${collection}`;
  const response = await fetch(sourceUrl, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`${requested.worldBankCode}: el compilador respondio ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const upstreamSha256 = createHash('sha256').update(bytes).digest('hex');
  const parsed: unknown = JSON.parse(bytes.toString('utf-8'));
  const observations = Array.isArray(parsed) ? (parsed[1] as CompilerPoint[] | null) : null;
  if (!observations?.length) throw new Error(`${requested.worldBankCode}: sin observaciones`);

  const points: SeriesPoint[] = [];
  for (const observation of observations) {
    if (observation.value === null) continue;
    const value = plainValue(observation.value);
    if (value === null) {
      console.warn(
        `  ${requested.indicatorCode} ${observation.date}: notacion exponencial, omitido`,
      );
      continue;
    }
    points.push({ period: observation.date, value, excerpt: JSON.stringify(observation) });
  }
  points.sort((left, right) => left.period.localeCompare(right.period));

  if (!points.length) throw new Error(`${requested.worldBankCode}: ninguna observacion utilizable`);
  console.log(
    `  ${requested.indicatorCode.padEnd(42)} ${String(points.length).padStart(3)} puntos  ` +
      `${points[0]?.period}-${points.at(-1)?.period}`,
  );

  return {
    indicatorCode: requested.indicatorCode,
    compilerCode: requested.worldBankCode,
    name: requested.name,
    unit: requested.unit,
    provenance: {
      publisher: 'BANCO MUNDIAL',
      sourceUrl,
      retrievedAt,
      upstreamSha256,
      frequency: 'ANNUAL',
    },
    points,
  };
}

async function main(): Promise<void> {
  const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;
  for (const group of [...MANIFEST, ...SOCIAL_MANIFEST]) {
    console.log(`\n${group.file}`);
    const series: unknown[] = [];
    for (const requested of group.series) series.push(await collectSeries(requested, retrievedAt));
    writeFileSync(join(SEED_DIR, group.file), `${JSON.stringify({ series }, null, 2)}\n`, 'utf-8');
    console.log(`  -> ${group.series.length} series escritas`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'World Bank collection failed'}\n`,
  );
  process.exitCode = 1;
});
