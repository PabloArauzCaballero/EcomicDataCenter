import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fxParallelHistorySchema } from '../schemas/fx-parallel-history.schema';

/**
 * Guards the committed series itself, not just the code that loads it.
 *
 * The snapshot is data a deployment writes into the real database, so a hole in
 * it or a value that stopped being a plain decimal would reach production as a
 * broken chart rather than as a failing build.
 */
describe('fx parallel history snapshot', () => {
  const load = async () =>
    fxParallelHistorySchema.parse(
      JSON.parse(await readFile(join(__dirname, '..', 'boot', 'fx-parallel-history.json'), 'utf8')),
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

  it('rejects a point whose value stopped being a number', async () => {
    const history = await load();
    const broken = {
      ...history,
      points: [{ ...history.points[0], buy: 'once con cincuenta' }],
    };

    expect(() => fxParallelHistorySchema.parse(broken)).toThrow();
  });
});
