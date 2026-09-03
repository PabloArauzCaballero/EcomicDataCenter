import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ungroundedMeasures } from '../../../common/economic-indicators/indicator-codes';
import { macroAnnualHistorySchema } from '../schemas/macro-annual-history.schema';

/**
 * Guards the rate and financial-soundness snapshots.
 *
 * These two files are what answers «what does credit cost» and «is the banking
 * system covered», and both questions had been going unanswered because the
 * figures were absent rather than wrong. The tests below hold the second half
 * of that: present, and still attached to the evidence they came from.
 */
describe('rate and financial soundness snapshots', () => {
  const load = async (file: string) =>
    macroAnnualHistorySchema.parse(
      JSON.parse(await readFile(join(__dirname, '..', 'boot', file), 'utf8')),
    );

  it('carries the price of credit as its own block', async () => {
    const rates = await load('macro-annual-rates.json');
    const codes = rates.series.map((series) => series.indicatorCode);

    expect(codes).toContain('RISK_PREMIUM_ON_LENDING_PCT');
    expect(codes).toContain('BANK_LENDING_DEPOSIT_SPREAD_PCT');
    expect(codes).toContain('BANK_NET_INTEREST_MARGIN_PCT');
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('carries what a reader means by banking coverage', async () => {
    const financial = await load('macro-annual-financial.json');
    const codes = financial.series.map((series) => series.indicatorCode);

    // Provisions against bad loans and regulatory capital are the two figures
    // «cobertura bancaria» actually names; the rest describe the system around
    // them.
    expect(codes).toContain('PROVISIONS_TO_NONPERFORMING_LOANS_PCT');
    expect(codes).toContain('BANK_REGULATORY_CAPITAL_PCT_RWA');
    expect(codes).toContain('BANK_RETURN_ON_EQUITY_PCT');
    expect(codes).toContain('LIQUID_ASSETS_TO_DEPOSITS_PCT');
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('collides with no indicator code the observatory already publishes', async () => {
    const held = new Set<string>();
    for (const file of [
      'macro-annual-history-1960.json',
      'macro-annual-history.json',
      'macro-annual-sectors.json',
      'macro-annual-debt.json',
      'macro-annual-fx.json',
    ]) {
      for (const series of (await load(file)).series) held.add(series.indicatorCode);
    }

    for (const file of ['macro-annual-rates.json', 'macro-annual-financial.json']) {
      for (const series of (await load(file)).series) {
        // A code is a contract with every saved query built on it, so a new
        // series may never quietly take one that is already in use.
        expect(held.has(series.indicatorCode)).toBe(false);
        held.add(series.indicatorCode);
      }
    }
  });

  it('gives every series its own citable retrieval', async () => {
    for (const file of ['macro-annual-rates.json', 'macro-annual-financial.json']) {
      const snapshot = await load(file);
      for (const series of snapshot.series) {
        expect(series.provenance.sourceUrl).toContain(series.compilerCode);
        expect(series.provenance.upstreamSha256).toMatch(/^[a-f0-9]{64}$/u);
      }
      const digests = snapshot.series.map((series) => series.provenance.upstreamSha256);
      expect(new Set(digests).size).toBe(digests.length);
    }
  });

  it('quotes each value in the record it was read from, in period order', async () => {
    for (const file of ['macro-annual-rates.json', 'macro-annual-financial.json']) {
      const snapshot = await load(file);
      for (const series of snapshot.series) {
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
        const periods = series.points.map((point) => point.period);
        expect(periods).toEqual([...periods].sort());
        expect(new Set(periods).size).toBe(periods.length);
      }
    }
  });
});
