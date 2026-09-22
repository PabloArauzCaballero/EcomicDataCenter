import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEO_MANIFEST, type Requested } from './imf-weo-series';

/**
 * Captures the Fund's annual view of Bolivia into a versioned seed.
 *
 * The Fund's own endpoint refuses this collector, so the series are taken from
 * the platform the multilateral system publishes them on, which answers the
 * same records with a stable, citable address. That makes two organisations
 * responsible for one figure and the seed records both: the Fund, whose method
 * and judgement the number is, and the platform, which is only where the bytes
 * were found. Crediting the platform would file an IMF projection of the fiscal
 * balance under the wrong house and send anyone who wants to argue with it to
 * the wrong door.
 *
 * Run with `yarn imf:collect`.
 */

const BASE = 'https://data360api.worldbank.org/data360/data';
const DATABASE = 'IMF_WEO';
const PUBLISHER = 'FONDO MONETARIO INTERNACIONAL';
/** Where the bytes come from, which is not whose figures these are. */
const DISTRIBUTOR = 'BANCO MUNDIAL';
const UA = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';
const SEED = join('src', 'database', 'seeds', 'boot', 'macro-annual-imf.json');

interface Observation {
  readonly TIME_PERIOD: string;
  readonly OBS_VALUE: string | null;
}

interface SeriesPoint {
  readonly period: string;
  readonly value: string;
  readonly excerpt: string;
}

/**
 * Last year that has finished.
 *
 * The Fund publishes the estimate and the forecast in one series and marks
 * neither, so every reading past the last closed year is a projection. This
 * observatory records what was measured; keeping them would put a forecast on
 * the same axis as a measurement with nothing to tell a reader which is which.
 */
function lastCompletedYear(): number {
  return new Date().getUTCFullYear() - 1;
}

/** A figure the grounding check can find again in the record it came from. */
function plainValue(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return /^-?\d+(?:\.\d+)?$/u.test(trimmed) ? trimmed : null;
}

async function collectSeries(requested: Requested, retrievedAt: string): Promise<unknown> {
  const indicator = `${DATABASE}_${requested.weoCode}`;
  const sourceUrl = `${BASE}?DATABASE_ID=${DATABASE}&REF_AREA=BOL&INDICATOR=${indicator}`;
  const response = await fetch(sourceUrl, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${indicator}: la plataforma respondio ${response.status}`);

  const bytes = Buffer.from(await response.arrayBuffer());
  const upstreamSha256 = createHash('sha256').update(bytes).digest('hex');
  const parsed = JSON.parse(bytes.toString('utf-8')) as { value?: readonly Observation[] };
  const observations = parsed.value;
  if (!observations?.length) throw new Error(`${indicator}: sin observaciones`);

  const closed = lastCompletedYear();
  const points: SeriesPoint[] = [];
  let projections = 0;
  for (const observation of observations) {
    if (Number(observation.TIME_PERIOD) > closed) {
      projections += 1;
      continue;
    }
    const value = plainValue(observation.OBS_VALUE);
    if (value === null) continue;
    points.push({
      period: observation.TIME_PERIOD,
      value,
      excerpt: JSON.stringify(observation),
    });
  }
  points.sort((left, right) => left.period.localeCompare(right.period));
  if (!points.length) throw new Error(`${indicator}: ninguna observacion utilizable`);

  console.log(
    `  ${requested.indicatorCode.padEnd(44)} ${String(points.length).padStart(3)} puntos  ` +
      `${points[0]?.period}-${points.at(-1)?.period}  (${projections} proyecciones omitidas)`,
  );

  return {
    indicatorCode: requested.indicatorCode,
    compilerCode: requested.weoCode,
    name: requested.name,
    unit: requested.unit,
    provenance: {
      publisher: PUBLISHER,
      distributor: DISTRIBUTOR,
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
  console.log(`\nmacro-annual-imf.json  (hasta ${lastCompletedYear()})`);
  const series: unknown[] = [];
  for (const requested of WEO_MANIFEST) series.push(await collectSeries(requested, retrievedAt));
  writeFileSync(SEED, `${JSON.stringify({ series }, null, 2)}\n`, 'utf-8');
  console.log(`  -> ${series.length} series escritas`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'IMF collection failed'}\n`);
  process.exitCode = 1;
});
