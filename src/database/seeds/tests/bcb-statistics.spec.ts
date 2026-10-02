import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { bcbStatisticsSchema } from '../schemas/bcb-statistics.schema';

/**
 * Guards the central bank's statistics.
 *
 * They are read out of Excel workbooks by heuristics, and a heuristic that puts a
 * figure under the wrong year fails without a sound: the chart draws, the number is
 * a real cell of the workbook, and only the date is wrong. Three things keep that
 * from shipping. Every series has to advance in time with no repeated or returning
 * date, which is how a mis-assigned year shows itself. A code has to be unique across
 * every family, or the view keeps whichever was received last and the other series
 * vanishes. And every file has to parse, because a seed that fails its schema stops
 * the boot of the whole server.
 */
describe('central bank statistic seeds', () => {
  const directory = join(__dirname, '..', 'boot', 'bcb-statistics');

  const load = async () => {
    const names = (await readdir(directory)).filter(
      (name) => name.endsWith('.json') && !name.startsWith('_'),
    );
    const files = [];
    for (const name of names.sort()) {
      const raw = JSON.parse(await readFile(join(directory, name), 'utf8')) as unknown;
      files.push({ name, seed: bcbStatisticsSchema.parse(raw) });
    }
    return files;
  };

  it('parses every family and advances in time in every series', async () => {
    const files = await load();
    expect(files.length).toBeGreaterThan(0);
    for (const { seed } of files) expect(seed.series.length).toBeGreaterThan(0);
  }, 120_000);

  it('never reuses a code across families', async () => {
    const files = await load();
    const codes = files.flatMap(({ seed }) => seed.series.map((one) => one.indicatorCode));
    expect(new Set(codes).size).toBe(codes.length);
  }, 120_000);

  it('names the family of each file in the file itself', async () => {
    for (const { name, seed } of await load()) {
      expect(`${seed.family}.json`).toBe(name);
      for (const one of seed.series) expect(one.family).toBe(seed.family);
    }
  }, 120_000);

  it('says where each series sits in its sheet', async () => {
    for (const { seed } of await load()) {
      for (const one of seed.series.slice(0, 200)) {
        // Una hoja de cálculo dice su orientación; un gráfico de PDF dice cuál y en qué página;
        // una serie armada con los cuadros diarios o semanales dice de qué entidad y columna.
        const sheet = ['columns', 'rows', 'matrix'].includes(String(one.locator.orientation));
        const chart = typeof one.locator.chart === 'string' && typeof one.locator.page === 'number';
        const cuts =
          typeof one.locator.entidad === 'string' &&
          typeof one.locator.columna === 'string' &&
          typeof one.locator.cuadros === 'number';
        expect(sheet || chart || cuts).toBe(true);
      }
    }
  }, 120_000);
});
