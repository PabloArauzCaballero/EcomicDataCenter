import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { publicAccountsSchema } from '../schemas/public-accounts.schema';

/**
 * Guards the public accounts.
 *
 * They are read out of workbooks, CSV files and SDMX answers by collectors that follow the
 * publisher's layout, and a layout that shifts by a row fails without a sound: the chart
 * draws, the figure is a real cell, and only the concept is wrong. What keeps that from
 * shipping: every series advances in time with no repeated or returning date, a code is
 * unique across every family (or the view keeps whichever was received last and the other
 * series vanishes), and every file parses, because a seed that fails its schema stops the
 * boot of the whole server.
 */
describe('public accounts seeds', () => {
  const directory = join(__dirname, '..', 'boot', 'public-accounts');

  const load = async () => {
    const names = (await readdir(directory)).filter(
      (name) => name.endsWith('.json') && !name.startsWith('_'),
    );
    const files = [];
    for (const name of names.sort()) {
      const raw = JSON.parse(await readFile(join(directory, name), 'utf8')) as unknown;
      files.push({ name, seed: publicAccountsSchema.parse(raw) });
    }
    return files;
  };

  it('parses every family and advances in time in every series', async () => {
    const files = await load();
    expect(files.length).toBeGreaterThan(0);
    for (const { seed } of files) expect(seed.series.length).toBeGreaterThan(0);
  });

  it('never reuses a code across families', async () => {
    const files = await load();
    const codes = files.flatMap(({ seed }) => seed.series.map((one) => one.indicatorCode));
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('names the family of each file in the file itself', async () => {
    for (const { name, seed } of await load()) {
      expect(`${seed.family}.json`).toBe(name);
      for (const one of seed.series) expect(one.family).toBe(seed.family);
    }
  });

  it('keeps the dates of each series coherent with its frequency', async () => {
    for (const { seed } of await load()) {
      for (const one of seed.series) {
        for (const [date] of one.points) {
          // Un año es el primero de enero y un mes es el día uno: una fecha suelta seria otra lectura.
          expect(date.endsWith(one.frequency === 'ANNUAL' ? '-01-01' : '-01')).toBe(true);
        }
      }
    }
  });

  it('closes the accounts of the non-financial public sector, month by month', async () => {
    const spnf = (await load()).find(({ seed }) => seed.family === 'spnf')?.seed;
    expect(spnf).toBeDefined();
    const byCode = new Map(spnf?.series.map((one) => [one.indicatorCode, one]));
    const value = (code: string, date: string): number =>
      Number(byCode.get(code)?.points.find((point) => point[0] === date)?.[1]);
    const income = byCode.get('FISC_SPNF_SPNF_INGRESOS_TOTALES_MM_BOB');
    expect(income).toBeDefined();
    for (const [date] of income?.points ?? []) {
      const balance =
        value('FISC_SPNF_SPNF_INGRESOS_TOTALES_MM_BOB', date) -
        value('FISC_SPNF_SPNF_EGRESOS_TOTALES_MM_BOB', date);
      // Ingresos menos egresos es el resultado global, con una tolerancia de redondeo.
      expect(
        Math.abs(balance - value('FISC_SPNF_SPNF_RESULTADO_GLOBAL_MM_BOB', date)),
      ).toBeLessThan(1);
    }
  });
});
