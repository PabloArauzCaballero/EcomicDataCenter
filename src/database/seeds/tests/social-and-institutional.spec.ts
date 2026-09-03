import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ungroundedMeasures } from '../../../common/economic-indicators/indicator-codes';
import { compositeIndexHistorySchema } from '../schemas/composite-index-history.schema';
import { macroAnnualHistorySchema } from '../schemas/macro-annual-history.schema';

/**
 * Guards the social and institutional blocks.
 *
 * These carry a risk the measured series do not. A composite index is somebody's
 * construction, and a figure that arrives without the name of whoever built it
 * is unreadable rather than merely unsourced — «28» says nothing until it says
 * «28 según Transparency International». The tests below hold that attribution
 * as hard as they hold the numbers.
 */
describe('social and institutional snapshots', () => {
  const read = async (file: string): Promise<unknown> =>
    JSON.parse(await readFile(join(__dirname, '..', 'boot', file), 'utf8'));

  const loadCompiled = async (file: string) => macroAnnualHistorySchema.parse(await read(file));
  const loadIndices = async () =>
    compositeIndexHistorySchema.parse(await read('composite-indices.json'));

  it('describes how people live, not only how much is produced', async () => {
    const social = await loadCompiled('macro-annual-social.json');
    const codes = social.series.map((series) => series.indicatorCode);

    expect(codes).toContain('INFANT_MORTALITY_PER_1000');
    expect(codes).toContain('BASIC_WATER_ACCESS_PCT');
    expect(codes).toContain('POVERTY_GAP_PCT');
    expect(codes).toContain('INTENTIONAL_HOMICIDES_PER_100K');
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('carries the governance estimates as scores, never as percentages', async () => {
    const governance = await loadCompiled('macro-annual-governance.json');
    const codes = governance.series.map((series) => series.indicatorCode);

    expect(codes).toContain('RULE_OF_LAW_SCORE');
    expect(codes).toContain('REGULATORY_QUALITY_SCORE');
    expect(codes).toContain('CONTROL_OF_CORRUPTION_SCORE');

    for (const series of governance.series) {
      // A governance estimate runs from about −2.5 to +2.5. Labelling one
      // `PERCENT` would put a negative percentage on a chart axis.
      expect(series.unit).toBe('SCORE');
    }
  });

  it('names the institution behind every index it did not measure itself', async () => {
    const indices = await loadIndices();
    const codes = indices.series.map((series) => series.indicatorCode);

    expect(codes).toContain('HUMAN_DEVELOPMENT_INDEX');
    expect(codes).toContain('CORRUPTION_PERCEPTIONS_INDEX');

    for (const series of indices.series) {
      expect(series.provenance.publisher.length).toBeGreaterThan(2);
      // The archive the bytes came from is not the institution whose judgement
      // the figure is, and the seed must never let the two collapse.
      expect(series.provenance.distributor).not.toBe(series.provenance.publisher);
      expect(series.provenance.sourceUrl).toContain('.csv');
    }
  });

  it('quotes every index value from the column its provenance names', async () => {
    const indices = await loadIndices();

    for (const series of indices.series) {
      for (const point of series.points) {
        const [heading, row] = point.excerpt.split('\n');
        // The evidence carries its own heading row, so the check is «is this
        // the field under that column» rather than «does the number appear».
        const column = (heading ?? '').split(',').indexOf(series.provenance.valueColumn);
        expect(column).toBeGreaterThanOrEqual(0);
        expect((row ?? '').split(',')[column]?.trim()).toBe(point.value);
      }
      const periods = series.points.map((point) => point.period);
      expect(periods).toEqual([...periods].sort());
      expect(new Set(periods).size).toBe(periods.length);
    }
  });

  it('quotes every compiled value in the record it was read from', async () => {
    for (const file of ['macro-annual-social.json', 'macro-annual-governance.json']) {
      const snapshot = await loadCompiled(file);
      for (const series of snapshot.series) {
        expect(series.provenance.sourceUrl).toContain(series.compilerCode);
        for (const point of series.points) {
          const measures = [
            {
              indicatorCode: series.indicatorCode,
              priceSide: null,
              value: point.value,
              unit: series.unit,
            },
          ];
          expect(ungroundedMeasures(measures, point.excerpt)).toEqual([]);
          expect(point.excerpt).toContain(`"date":"${point.period}"`);
        }
      }
    }
  });
});
