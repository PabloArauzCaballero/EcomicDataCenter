import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ungroundedMeasures } from '../../../common/economic-indicators/indicator-codes';
import { macroAnnualHistorySchema } from '../schemas/macro-annual-history.schema';

/**
 * Guards the committed macroeconomic series.
 *
 * The first attempt at this snapshot captured the wrong nested object as the
 * quotation for every point, and only the grounding check caught it. These
 * tests move that catch to the build, where it costs nothing.
 */
describe('macro annual history snapshot', () => {
  const load = async () =>
    macroAnnualHistorySchema.parse(
      JSON.parse(
        await readFile(join(__dirname, '..', 'boot', 'macro-annual-history.json'), 'utf8'),
      ),
    );

  it('parses against its schema and covers the indicators the report needs', async () => {
    const history = await load();
    const codes = history.series.map((series) => series.indicatorCode);

    expect(codes).toContain('CPI_INFLATION_ANNUAL_PCT');
    expect(codes).toContain('GDP_GROWTH_ANNUAL_PCT');
    expect(codes).toContain('INTERNATIONAL_RESERVES_USD');
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('gives every series its own citable retrieval', async () => {
    const history = await load();

    for (const series of history.series) {
      // Each indicator has its own address and its own digest, so a figure can
      // be re-requested on its own rather than as part of a bundle.
      expect(series.provenance.sourceUrl).toContain(series.worldBankCode);
      expect(series.provenance.upstreamSha256).toMatch(/^[a-f0-9]{64}$/u);
    }
    const digests = history.series.map((series) => series.provenance.upstreamSha256);
    expect(new Set(digests).size).toBe(digests.length);
  });

  it('quotes each value in the fragment it was read from', async () => {
    const history = await load();

    for (const series of history.series) {
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
        // The fragment must be the row for that year, not a neighbouring object.
        expect(point.excerpt).toContain(`"date":"${point.period}"`);
      }
    }
  });

  it('orders every series by period and repeats no year', async () => {
    const history = await load();

    for (const series of history.series) {
      const periods = series.points.map((point) => point.period);
      expect(periods).toEqual([...periods].sort());
      expect(new Set(periods).size).toBe(periods.length);
    }
  });
});
