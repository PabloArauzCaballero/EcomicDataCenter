import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exogenousFactorsSchema } from '../../../src/database/seeds/schemas/exogenous-factors.schema';
import { FACTOR_MANIFEST } from './factor-manifest';
import { buildFactorSeries } from './collect-factors';

/** Offline replay checks actual response bytes, not a second generated fixture. */
const seed = exogenousFactorsSchema.parse(
  JSON.parse(
    readFileSync(join('src', 'database', 'seeds', 'boot', 'exogenous-factors.json'), 'utf8'),
  ) as unknown,
);
let checked = 0;
for (const series of seed.series) {
  const spec = FACTOR_MANIFEST.find((candidate) => candidate.code === series.code);
  if (!spec) throw new Error(`No connector definition for ${series.code}`);
  const point = series.points[0]!;
  const bytes = readFileSync(
    join('artifacts', 'exogenous-factors', 'raw', `${point.upstreamSha256}.raw`),
  );
  if (createHash('sha256').update(bytes).digest('hex') !== point.upstreamSha256)
    throw new Error('Raw digest mismatch');
  const rebuilt = buildFactorSeries(
    spec,
    {
      bytes,
      sourceUrl: point.sourceUrl,
      upstreamSha256: point.upstreamSha256,
      retrievedAt: point.retrievedAt,
    },
    series,
  );
  if (JSON.stringify(rebuilt.points) !== JSON.stringify(series.points))
    throw new Error(`Replay mismatch: ${series.code}`);
  checked += series.points.length;
}
process.stdout.write(
  `Verified ${seed.series.length} series and ${checked} points against original response bytes.\n`,
);
