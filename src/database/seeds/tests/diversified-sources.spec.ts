import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ungroundedMeasures } from '../../../common/economic-indicators/indicator-codes';
import { foreignTradeHistorySchema } from '../schemas/foreign-trade-history.schema';
import { macroAnnualHistorySchema } from '../schemas/macro-annual-history.schema';

/**
 * Guards the corpora that gave the annual figures a second voice.
 *
 * Every annual series here came from one compiler, which reads as agreement
 * when it is really one method repeated. These tests hold the two properties
 * that make a second compiler worth having: that it is attributed to the house
 * whose judgement the figure is rather than to whoever served the bytes, and
 * that it never quietly overwrites the first compiler's reading of a year.
 */

const boot = (file: string) => join(__dirname, '..', 'boot', file);
const readJson = async (file: string): Promise<unknown> =>
  JSON.parse(await readFile(boot(file), 'utf8'));

/** A year that has not finished is a projection, whoever published it. */
const lastCompletedYear = new Date().getUTCFullYear() - 1;

describe('International Monetary Fund annual series', () => {
  const load = async () => macroAnnualHistorySchema.parse(await readJson('macro-annual-imf.json'));

  it('answers the fiscal questions no other series here answers', async () => {
    const history = await load();
    const codes = history.series.map((series) => series.indicatorCode);

    expect(codes).toContain('IMF_FISCAL_BALANCE_PCT_GDP');
    expect(codes).toContain('IMF_GROSS_PUBLIC_DEBT_PCT_GDP');
    expect(codes).toContain('IMF_GOVERNMENT_REVENUE_PCT_GDP');
    expect(codes).toContain('IMF_GOVERNMENT_EXPENDITURE_PCT_GDP');
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('credits the compiler and names the platform separately', async () => {
    const history = await load();

    for (const series of history.series) {
      expect(series.provenance.publisher).toBe('FONDO MONETARIO INTERNACIONAL');
      // The bytes come from somewhere the Fund does not run, and saying so is
      // the whole point: the method is the Fund's, the hosting is not.
      expect(series.provenance.distributor).toBe('BANCO MUNDIAL');
      expect(series.provenance.distributor).not.toBe(series.provenance.publisher);
      // The assertion the loader writes is the series name, so the name has to
      // carry the attribution or the claim reads as if nobody made it.
      expect(series.name).toContain('FMI');
    }
  });

  it('cannot overwrite the other compiler, and gives each series its own retrieval', async () => {
    const worldBank = macroAnnualHistorySchema.parse(await readJson('macro-annual-history.json'));
    const history = await load();
    const theirs = new Set(worldBank.series.map((series) => series.indicatorCode));

    for (const series of history.series) {
      expect(theirs.has(series.indicatorCode)).toBe(false);
      expect(series.provenance.sourceUrl).toContain(series.compilerCode);
      expect(series.provenance.upstreamSha256).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it('keeps measurements only, never the years the Fund projects', async () => {
    const history = await load();

    for (const series of history.series) {
      const periods = series.points.map((point) => point.period);
      expect(periods).toEqual([...periods].sort());
      expect(new Set(periods).size).toBe(periods.length);
      for (const period of periods) expect(Number(period)).toBeLessThanOrEqual(lastCompletedYear);
    }
  });

  it('quotes each value in the record it was read from', async () => {
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
        expect(point.excerpt).toContain(`"TIME_PERIOD":"${point.period}"`);
      }
    }
  });
});

describe('declared foreign trade', () => {
  const load = async () => foreignTradeHistorySchema.parse(await readJson('foreign-trade.json'));

  it('carries both directions of the border, attributed to the register', async () => {
    const history = await load();
    const codes = history.series.map((series) => series.indicatorCode);

    expect(codes).toEqual(['COMTRADE_GOODS_EXPORTS_USD', 'COMTRADE_GOODS_IMPORTS_USD']);
    for (const series of history.series) {
      expect(series.publisher).toBe('NACIONES UNIDAS');
      expect(series.unit).toBe('USD');
    }
  });

  it('gives every single year its own request and its own digest', async () => {
    const history = await load();

    for (const series of history.series) {
      const digests = series.points.map((point) => point.upstreamSha256);
      expect(new Set(digests).size).toBe(digests.length);
      for (const point of series.points) {
        // The register answers one year per request, so the address a reader
        // follows has to be the one that returns that year and no other.
        expect(point.sourceUrl).toContain(`period=${point.period}`);
        expect(Number(point.period)).toBeLessThanOrEqual(lastCompletedYear);
      }
    }
  });

  it('quotes each total in the record it was read from, in order', async () => {
    const history = await load();

    for (const series of history.series) {
      const periods = series.points.map((point) => point.period);
      expect(periods).toEqual([...periods].sort());
      expect(new Set(periods).size).toBe(periods.length);
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
      }
    }
  });
});
