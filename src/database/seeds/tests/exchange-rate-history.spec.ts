import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exchangeRateHistorySchema } from '../schemas/exchange-rate-history.schema';

/**
 * Guards the committed series themselves, not just the code that loads them.
 *
 * These snapshots are data a deployment writes into the real database, so a
 * hole in one, or a value that stopped being a plain decimal, would reach
 * production as a broken chart rather than as a failing build.
 */
const SNAPSHOTS = ['fx-parallel-history.json', 'fx-official-history.json'] as const;

describe.each(SNAPSHOTS)('%s', (fileName) => {
  const load = async () =>
    exchangeRateHistorySchema.parse(
      JSON.parse(await readFile(join(__dirname, '..', 'boot', fileName), 'utf8')),
    );

  it('parses against its schema', async () => {
    const history = await load();

    expect(history.points.length).toBeGreaterThan(200);
    expect(history.provenance.aggregation).toBe('DAILY_AVERAGE');
  });

  it('states where it came from, precisely enough to re-request', async () => {
    const { provenance } = await load();

    // Anyone can ask the publisher for the same range and compare the digest.
    expect(provenance.sourceUrl).toContain(provenance.rangeStart);
    expect(provenance.sourceUrl).toContain(provenance.rangeEnd);
    expect(provenance.upstreamSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('covers every calendar day of its declared range, with no gap', async () => {
    const history = await load();
    const dates = history.points.map((point) => point.date);

    expect(dates[0]).toBe(history.provenance.rangeStart);
    expect(dates.at(-1)).toBe(history.provenance.rangeEnd);
    expect(new Set(dates).size).toBe(dates.length);

    for (let index = 1; index < dates.length; index += 1) {
      const previous = new Date(`${dates[index - 1]}T00:00:00Z`);
      previous.setUTCDate(previous.getUTCDate() + 1);
      expect(dates[index]).toBe(previous.toISOString().slice(0, 10));
    }
  });

  it('quotes both sides as plain decimals the database can cast', async () => {
    const history = await load();

    for (const point of history.points) {
      expect(point.buy).toMatch(/^\d+(?:\.\d+)?$/u);
      expect(point.sell).toMatch(/^\d+(?:\.\d+)?$/u);
      expect(Number(point.buy)).toBeGreaterThan(0);
      expect(Number(point.sell)).toBeGreaterThan(0);
    }
  });

  it('keeps every captured quotation consistent with the values read from it', async () => {
    const history = await load();

    for (const point of history.points) {
      if (!point.excerpt) continue;
      // The excerpt is the fragment the values were parsed out of, so both must
      // appear in it verbatim.
      expect(point.excerpt).toContain(point.buy);
      expect(point.excerpt).toContain(point.sell);
    }
  });
});

describe('exchange rate history snapshots', () => {
  it('rejects a point whose value stopped being a number', async () => {
    const history = exchangeRateHistorySchema.parse(
      JSON.parse(await readFile(join(__dirname, '..', 'boot', 'fx-parallel-history.json'), 'utf8')),
    );

    expect(() =>
      exchangeRateHistorySchema.parse({
        ...history,
        points: [{ ...history.points[0], buy: 'once con cincuenta' }],
      }),
    ).toThrow();
  });

  it('attributes the official rate to the institution that sets it', async () => {
    const official = exchangeRateHistorySchema.parse(
      JSON.parse(await readFile(join(__dirname, '..', 'boot', 'fx-official-history.json'), 'utf8')),
    );

    // The aggregator republishes it; the central bank sets it. Attributing the
    // figure to whoever served the file would misstate its authority.
    expect(official.provenance.originator).toBe('BANCO CENTRAL DE BOLIVIA');
    expect(official.provenance.publisher).not.toBe(official.provenance.originator);
  });
});
