import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EXOGENOUS_GROUPS, exogenousPricesSchema } from '../schemas/exogenous-prices.schema';

/**
 * Guards the prices Bolivia does not set.
 *
 * Three things make the chapter usable and each has failed silently somewhere
 * else in this corpus. Every family the tab offers has to arrive with series,
 * or a chip opens onto nothing. A code has to be unique across both files, or
 * the view's one-row-per-series-and-period rule keeps whichever was received
 * last and the other vanishes. And every figure has to be one the publisher
 * printed: the World Bank workbook stores binary floats, and a value that
 * drifted from its cell by a rounding step would still look plausible.
 */
describe('exogenous price snapshots', () => {
  const load = async (file: string) =>
    exogenousPricesSchema.parse(
      JSON.parse(await readFile(join(__dirname, '..', 'boot', file), 'utf8')),
    );

  it('covers the six families the tab offers', async () => {
    const monthly = await load('exogenous-prices.json');
    const customs = await load('exogenous-customs.json');
    const groups = new Set([...monthly.series, ...customs.series].map((one) => one.group));

    expect([...groups].sort()).toEqual([...EXOGENOUS_GROUPS].sort());
  });

  it('never reuses a code across the two files', async () => {
    const monthly = await load('exogenous-prices.json');
    const customs = await load('exogenous-customs.json');
    const codes = [...monthly.series, ...customs.series].map((one) => one.indicatorCode);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('holds one ascending reading per period in every series', async () => {
    for (const file of ['exogenous-prices.json', 'exogenous-customs.json']) {
      const seed = await load(file);
      for (const series of seed.series) {
        const periods = series.points.map((point) => point.period);
        expect(periods).toEqual([...periods].sort());
        expect(new Set(periods).size).toBe(periods.length);
      }
    }
  });

  it('keeps each monthly figure equal to the number its excerpt quotes', async () => {
    const monthly = await load('exogenous-prices.json');
    for (const series of monthly.series) {
      for (const point of series.points) {
        const quoted = /(-?\d+(?:\.\d+)?)\D*$/u.exec(point.excerpt)?.[1];
        expect(Number(point.value)).toBeCloseTo(Number(quoted), 6);
      }
    }
  });

  it('derives each customs price from the value and weight it declares', async () => {
    const customs = await load('exogenous-customs.json');
    for (const series of customs.series) {
      for (const point of series.points) {
        const derived = Number(point.tradeValueUsd) / Number(point.netWeightKg);
        expect(Number(point.value)).toBeCloseTo(derived, 3);
        expect(point.excerpt).toContain(`"netWgt":${point.netWeightKg}`);
      }
    }
  });
});
