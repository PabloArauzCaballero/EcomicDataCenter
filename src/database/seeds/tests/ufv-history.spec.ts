import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ufvHistorySchema } from '../schemas/ufv-history.schema';

/**
 * Guards the recovered life of the Unidad de Fomento de Vivienda.
 *
 * It is tempting to assert the unit only ever climbs. It does not: the UFV is
 * computed from the consumer price index, so it falls when prices fall, and the
 * series contains two such stretches — August and September 2002, and December
 * 2020 into January 2021 — both real Bolivian deflation. The invariant that
 * does hold is smoothness. The bank publishes a daily indexation, so any step
 * larger than a fraction of a per cent is a parsing fault rather than an
 * economic event, and that is what these tests hold, together with the two
 * things that make the series citable: where each year came from, and that the
 * value stored matches the one the bank printed.
 */
describe('UFV history snapshot', () => {
  const load = async () =>
    ufvHistorySchema.parse(
      JSON.parse(await readFile(join(__dirname, '..', 'boot', 'ufv-history.json'), 'utf8')),
    );

  it('starts the day the unit was created, at parity with the boliviano', async () => {
    const history = await load();
    const first = history.years[0]?.points[0];

    expect(history.years[0]?.period).toBe('2001');
    expect(first?.eventDate).toBe('2001-12-07');
    expect(Number(first?.value)).toBe(1);
  });

  it('holds one reading per calendar day, without gaps inside a year', async () => {
    const history = await load();

    for (const year of history.years) {
      const dates = year.points.map((point) => point.eventDate);
      expect(dates).toEqual([...dates].sort());
      expect(new Set(dates).size).toBe(dates.length);
      for (const date of dates) expect(date.startsWith(`${year.period}-`)).toBe(true);
    }
    const periods = history.years.map((year) => year.period);
    expect(periods).toEqual([...periods].sort());
  });

  it('moves by a daily indexation step, never by a jump', async () => {
    const history = await load();
    const points = history.years.flatMap((year) => year.points);
    const declines: string[] = [];

    for (const [index, point] of points.entries()) {
      if (index === 0) continue;
      const value = Number(point.value);
      const previous = Number(points[index - 1]?.value);
      // A day that moved the unit by more than a tenth of a per cent is a
      // misread row, not an indexation: the largest real step in the whole
      // series is three thousandths of a per cent.
      expect(Math.abs(value / previous - 1)).toBeLessThan(0.001);
      if (value < previous) declines.push(point.eventDate);
    }

    // Falls exist and are rare: they are the deflation of 2002 and of 2020-21,
    // not a broken sort.
    expect(declines.length).toBeGreaterThan(0);
    expect(declines.length / points.length).toBeLessThan(0.02);
    for (const date of declines) {
      expect(date.slice(0, 7)).toMatch(/^(?:2002-0[89]|2020-12|2021-01)$/u);
    }
    // Twenty-four years of indexation, not a flat line.
    expect(Number(points.at(-1)?.value)).toBeGreaterThan(3);
  });

  it('stores the figure the bank printed, only unpadded', async () => {
    const history = await load();

    for (const year of history.years) {
      for (const point of year.points) {
        expect(point.excerpt).toContain(point.statedValue);
        expect(Number(point.statedValue)).toBe(Number(point.value));
        // The trim removes padding zeros and nothing else.
        expect(point.statedValue.startsWith(point.value.replace(/\.0$/u, '.'))).toBe(true);
      }
    }
  });

  it('gives every year its own citable retrieval', async () => {
    const history = await load();

    for (const year of history.years) {
      expect(year.sourceUrl).toContain(`cFecIni=${year.period}-01-01`);
      expect(year.sourceUrl).toContain(`cFecFin=${year.period}-12-31`);
      expect(year.documentSha256).toMatch(/^[a-f0-9]{64}$/u);
    }
    const digests = history.years.map((year) => year.documentSha256);
    expect(new Set(digests).size).toBe(digests.length);
  });
});
