import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tradeCatalogueSchema, tradeYearSchema } from '../schemas/ine-trade.schema';

/**
 * Guards the customs register of the statistics institute.
 *
 * Three promises the dashboard makes about it. Every year file is the shape
 * the stored copy unpacks by position, or a column lands in the wrong field
 * without an error. The rows of each cube add up to the total the institute
 * printed for that year, or aggregation lost or doubled declarations. And the
 * catalogue names every code the cubes use, or a bar is labelled with a bare
 * number.
 */
const DIRECTORY = join(__dirname, '..', 'boot', 'ine-trade');

const load = async (file: string) =>
  tradeYearSchema.parse(JSON.parse(await readFile(join(DIRECTORY, file), 'utf8')));

type Seed = Awaited<ReturnType<typeof load>>;

// Fifty-odd files and sixty megabytes: read once, and with room to do it.
const READ_MS = 180_000;

const yearFiles = async () =>
  (await readdir(DIRECTORY)).filter((name) => /^(exports|imports)-\d{4}\.json$/u.test(name));

describe('ine trade register', () => {
  const seeds = new Map<string, Seed>();
  beforeAll(async () => {
    for (const file of await yearFiles()) seeds.set(file, await load(file));
  }, READ_MS);
  it('carries exports from 1992 and imports from 2010, without gaps', async () => {
    const files = await yearFiles();
    const years = (prefix: string) =>
      files
        .filter((name) => name.startsWith(prefix))
        .map((name) => Number(/\d{4}/u.exec(name)?.[0]))
        .sort((left, right) => left - right);
    const exports = years('exports');
    const imports = years('imports');
    expect(exports[0]).toBe(1992);
    expect(imports[0]).toBe(2010);
    for (const list of [exports, imports]) {
      list.forEach((year, index) => {
        if (index > 0) expect(year).toBe((list[index - 1] ?? 0) + 1);
      });
    }
  });

  it('adds every cube up to the total the institute printed', async () => {
    for (const seed of seeds.values()) {
      const usdAt = seed.flow === 'X' ? 5 : 2;
      const detail = seed.detail.reduce((sum, row) => sum + Number(row[usdAt]), 0);
      // Rounding each row to the cent can move the sum by half a cent per row.
      const tolerance = seed.detail.length * 0.005 + 1;
      expect(Math.abs(detail - seed.totals.usd)).toBeLessThan(tolerance);
      if (seed.flow === 'M') {
        const monthly = seed.monthly.reduce((sum, row) => sum + Number(row[4]), 0);
        expect(Math.abs(monthly - seed.totals.usd)).toBeLessThan(seed.monthly.length * 0.005 + 1);
      }
    }
  });

  it('matches the institute tables where they were checked by hand', async () => {
    // Cuadro «Comercio Exterior según Año y Trimestre», INE, leído el 2026-09-27.
    const total = (file: string) => Math.round((seeds.get(file)?.totals.usd ?? 0) / 1e5) / 10;
    expect(total('exports-2024.json')).toBe(9059.2);
    expect(total('imports-2010.json')).toBe(5603.9);
    expect(total('exports-2025.json')).toBe(9702.1);
    expect(total('imports-2025.json')).toBe(10063.7);
  });

  it('names every product and country the cubes use', async () => {
    const catalogue = tradeCatalogueSchema.parse(
      JSON.parse(await readFile(join(DIRECTORY, 'catalogue.json'), 'utf8')),
    );
    const missing = new Set<string>();
    for (const seed of seeds.values()) {
      for (const row of seed.detail) {
        const nandina = String(seed.flow === 'X' ? row[1] : row[0]);
        const country = String(seed.flow === 'X' ? row[2] : row[1]);
        if (!catalogue.products[nandina]) missing.add(`producto ${nandina}`);
        if (!catalogue.countries[country]) missing.add(`país ${country}`);
      }
    }
    expect([...missing].slice(0, 10)).toEqual([]);
  });
});
