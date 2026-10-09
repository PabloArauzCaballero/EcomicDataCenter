import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { exogenousFactorsSchema } from '../../../src/database/seeds/schemas/exogenous-factors.schema';
import type {
  ExogenousFactorSeries,
  ExogenousFactors,
} from '../../../src/database/seeds/schemas/exogenous-factors.schema';
import { FACTOR_MANIFEST, factorSourceUrl } from './factor-manifest';
import type { FactorSpec } from './factor-manifest';
import { parseNewYorkFed, parseNoaaOni, parseWorldBank } from './factor-parsers';
import {
  attachEvidence,
  downloadFactor,
  factorDefinitionKey,
  saveFactorEvidence,
  writeFactorJson,
} from './factor-state';
import type { FactorDownload } from './factor-state';

export interface CollectionStatus {
  code: string;
  sourceUrl: string;
  connector: string;
  status: 'UPDATED' | 'FAILED_KEPT' | 'FAILED_EMPTY';
  observations: number;
  missing: number;
  latestObservedPeriod: string | null;
  checkedAt: string;
  error: string | null;
}

export interface CollectOptions {
  seedPath?: string;
  evidenceDirectory?: string;
  manifest?: readonly FactorSpec[];
  fetcher?: (url: string) => Promise<FactorDownload>;
  now?: Date;
}

function readPrevious(file: string): ExogenousFactors {
  if (!existsSync(file)) return { version: 1, series: [] };
  // A corrupt last-good file is an error, never silently treated as empty.
  return exogenousFactorsSchema.parse(JSON.parse(readFileSync(file, 'utf8')) as unknown);
}

export function buildFactorSeries(
  spec: FactorSpec,
  download: FactorDownload,
  previous?: ExogenousFactorSeries,
): ExogenousFactorSeries {
  const text = download.bytes.toString('utf8');
  const rows =
    spec.connector === 'WDI'
      ? parseWorldBank(text, spec.indicator, spec.country)
      : spec.connector === 'NOAA_ONI'
        ? parseNoaaOni(text)
        : parseNewYorkFed(text, 'EFFR');
  const historical = rows.filter(
    (row) => row.period >= '2000' && row.period <= download.retrievedAt.slice(0, row.period.length),
  );
  if (!historical.some((row) => row.value !== null))
    throw new Error('No usable historical observations since 2000');
  const { connector, indicator, country, ...metadata } = spec;
  void connector;
  void indicator;
  void country;
  const series: ExogenousFactorSeries = {
    ...metadata,
    sourceUrl: download.sourceUrl,
    freshnessDays: null,
    points: [],
  };
  const sameDefinition = previous && factorDefinitionKey(previous) === factorDefinitionKey(series);
  series.points = attachEvidence(historical, download, sameDefinition ? previous.points : []);
  return exogenousFactorsSchema.parse({ version: 1, series: [series] }).series[0]!;
}

/** Partial upstream failures keep the entire previous valid series unchanged. */
export async function collectFactors(
  options: CollectOptions = {},
): Promise<{ seed: ExogenousFactors; statuses: CollectionStatus[] }> {
  const seedPath =
    options.seedPath ?? join('src', 'database', 'seeds', 'boot', 'exogenous-factors.json');
  const evidence = options.evidenceDirectory ?? join('artifacts', 'exogenous-factors');
  const previous = readPrevious(seedPath);
  const held = new Map(previous.series.map((series) => [series.code, series]));
  const fetcher = options.fetcher ?? downloadFactor;
  const now = options.now ?? new Date();
  const manifest = options.manifest ?? FACTOR_MANIFEST;
  if (new Set(manifest.map((spec) => spec.code)).size !== manifest.length)
    throw new Error('Duplicate manifest code');
  mkdirSync(evidence, { recursive: true });
  const statuses: CollectionStatus[] = [];
  // Small bounded groups respect upstream services and avoid an all-or-nothing batch.
  for (let start = 0; start < manifest.length; start += 3) {
    const group = manifest.slice(start, start + 3);
    const results = await Promise.allSettled(
      group.map(async (spec) => {
        const sourceUrl = factorSourceUrl(spec, now);
        const download = await fetcher(sourceUrl);
        if (download.sourceUrl !== sourceUrl)
          throw new Error('Fetcher returned a different source identity');
        saveFactorEvidence(download, join(evidence, 'raw'));
        return { series: buildFactorSeries(spec, download, held.get(spec.code)), download };
      }),
    );
    results.forEach((result, index) => {
      const spec = group[index]!;
      const sourceUrl = factorSourceUrl(spec, now);
      const old = held.get(spec.code);
      if (result.status === 'fulfilled') {
        const series = result.value.series;
        const oldPoints = new Map(old?.points.map((point) => [point.period, point]) ?? []);
        const definitionChanged = old && factorDefinitionKey(old) !== factorDefinitionKey(series);
        const revisions = series.points.filter(
          (point) =>
            definitionChanged || point.firstSeenAt !== oldPoints.get(point.period)?.firstSeenAt,
        );
        if (revisions.length) {
          const changedPeriods = new Set(revisions.map((point) => point.period));
          appendFileSync(
            join(evidence, 'revisions.jsonl'),
            `${JSON.stringify({
              version: 2,
              code: series.code,
              capturedAt: result.value.download.retrievedAt,
              previous: old
                ? { ...old, points: old.points.filter((point) => changedPeriods.has(point.period)) }
                : null,
              current: { ...series, points: revisions },
            })}\n`,
            'utf8',
          );
        }
        held.set(spec.code, series);
      }
      const current = held.get(spec.code);
      const observed = current?.points.filter((point) => point.value !== null) ?? [];
      const status: CollectionStatus = {
        code: spec.code,
        sourceUrl,
        connector: spec.connector,
        status: result.status === 'fulfilled' ? 'UPDATED' : old ? 'FAILED_KEPT' : 'FAILED_EMPTY',
        observations: observed.length,
        missing: current ? current.points.length - observed.length : 0,
        latestObservedPeriod: observed.at(-1)?.period ?? null,
        checkedAt:
          result.status === 'fulfilled'
            ? result.value.download.retrievedAt
            : new Date().toISOString(),
        error:
          result.status === 'rejected'
            ? result.reason instanceof Error
              ? result.reason.message
              : 'Collection failed'
            : null,
      };
      statuses.push(status);
      process.stdout.write(
        `${status.code}: ${status.status} (${status.observations} observations${status.error ? `; ${status.error}` : ''})\n`,
      );
    });
  }
  writeFactorJson(join(evidence, 'status.json'), {
    checkedAt: new Date().toISOString(),
    sources: statuses,
  });
  if (!held.size)
    throw new Error('All sources failed and no previous seed exists; seed not replaced');
  const seed = exogenousFactorsSchema.parse({
    version: 1,
    series: [...held.values()].sort((a, b) => a.code.localeCompare(b.code)),
  });
  writeFactorJson(seedPath, seed);
  writeFactorJson(join(evidence, 'manifest-summary.json'), {
    reviewedAt: new Date().toISOString(),
    seedSha256: createHash('sha256').update(readFileSync(seedPath)).digest('hex'),
    coverageMeaning:
      'Sections indicate scoped relevance, not complete economic coverage. WDI is adapted from an existing macro source.',
    sourceKeysUnique:
      new Set(seed.series.map((series) => series.sourceSeriesKey)).size === seed.series.length,
    series: seed.series.map((series) => ({
      code: series.code,
      familyIds: series.familyIds,
      sectorIds: series.sectorIds,
      sourceSeriesKey: series.sourceSeriesKey,
      sourceUrl: series.sourceUrl,
      frequency: series.frequency,
      licenseStatus: series.licenseStatus,
      publicUseBlockReason: series.licenseStatus === 'PUBLIC_REUSE_ALLOWED' ? null : series.note,
      observationCount: series.points.filter((point) => point.value !== null).length,
      latestObservedPeriod:
        series.points.filter((point) => point.value !== null).at(-1)?.period ?? null,
    })),
  });
  writeFactorJson(join(evidence, 'metrics.json'), {
    checkedAt: new Date().toISOString(),
    series: seed.series.length,
    points: seed.series.reduce((sum, series) => sum + series.points.length, 0),
    observed: seed.series.reduce(
      (sum, series) => sum + series.points.filter((point) => point.value !== null).length,
      0,
    ),
    updated: statuses.filter((status) => status.status === 'UPDATED').length,
    failedKept: statuses.filter((status) => status.status === 'FAILED_KEPT').length,
    failedEmpty: statuses.filter((status) => status.status === 'FAILED_EMPTY').length,
    note: 'WDI adapts existing macro source identities. No publication timestamps inferred from periods or API lastupdated.',
  });
  return { seed, statuses };
}

export async function main(): Promise<void> {
  const { seed, statuses } = await collectFactors();
  process.stdout.write(`Saved ${seed.series.length} series.\n`);
  if (statuses.some((status) => status.status !== 'UPDATED')) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Factor collection failed'}\n`,
    );
    process.exitCode = 1;
  });
}
