import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { coherent, parseCurrencyTable } from '../../../../scripts/markets/bcb-currency-table';
import { currencyRatesSchema } from '../schemas/exogenous-prices.schema';

/**
 * Guards the boliviano against other currencies.
 *
 * The parser is exercised against rows captured verbatim from the BCB table,
 * entities and all. The seed is held to what the collector promises: one
 * reading per currency and date, ascending, and every figure equal to the
 * number its own excerpt quotes.
 */
const TABLE = `
<span>FECHA DE LA COTIZACI&Oacute;N:&nbsp; </span><strong>1 de Octubre 2026</strong>
<tr class="fila1"><td>ESTADOS UNIDOS</td><td>D&Oacute;LAR</td><td class="centro">USD</td><td class="numero">12.00</td></tr>
<tr class="fila1"><td>JAP&Oacute;N</td><td>YEN</td><td class="centro">JPY</td><td class="numero">0.07625</td><td class="numero">157.38</td></tr>
<tr class="fila2"><td>REP. POPULAR CHINA</td><td>YUAN RENMINBI</td><td class="centro">CNY</td><td class="numero">1.78934</td><td class="numero">6.7064</td></tr>
<tr class="fila1"><td>ARGENTINA</td><td>PESO</td><td class="centro">ARS</td><td class="numero">0.00789</td><td class="numero">1,520.2476</td></tr>
<tr class="fila2"><td>X</td><td>BROKEN</td><td class="centro">XXX</td><td class="numero">1.00000</td><td class="numero">1.0</td></tr>
`;

describe('BCB currency table', () => {
  it('reads the date the page declares and every currency row', () => {
    const table = parseCurrencyTable(TABLE);
    expect(table.effectiveDate).toBe('2026-10-01');
    expect(table.officialUsd).toBe('12.00');
    const yen = table.rows.find((row) => row.iso === 'JPY');
    expect(yen).toMatchObject({ bobPerUnit: '0.07625', perUsd: '157.38', country: 'JAPÓN' });
    expect(table.rows.find((row) => row.iso === 'ARS')?.perUsd).toBe('1520.2476');
  });

  it('reads the date of a page asked for by day', () => {
    const page = TABLE.replace(
      /<span>[^<]*<\/span><strong>[^<]*<\/strong>/u,
      '<div>TABLA DE COTIZACIONES DEL 28 DE SEPTIEMBRE  DE 2026&nbsp;</div>',
    );
    expect(parseCurrencyTable(page).effectiveDate).toBe('2026-09-28');
  });

  it('refuses a row whose product with the dollar does not give the dollar back', () => {
    const table = parseCurrencyTable(TABLE);
    expect(coherent(table.rows.find((row) => row.iso === 'JPY')!, table.officialUsd)).toBe(true);
    expect(coherent(table.rows.find((row) => row.iso === 'XXX')!, table.officialUsd)).toBe(false);
  });

  it('fails loudly when the page has no recognizable date', () => {
    expect(() => parseCurrencyTable('<table></table>')).toThrow(/fecha/u);
  });
});

describe('currency seeds', () => {
  const directory = join(__dirname, '..', 'boot', 'exogenous-currencies');
  const load = async () => {
    const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
    return Promise.all(
      names.map(async (name) =>
        currencyRatesSchema.parse(JSON.parse(await readFile(join(directory, name), 'utf8'))),
      ),
    );
  };

  it('holds one series per file, named for its currency', async () => {
    const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
    const seeds = await load();
    seeds.forEach((seed, index) => {
      expect(seed.series).toHaveLength(1);
      expect(`${seed.series[0]?.product}.json`).toBe(names[index]);
    });
  });

  it('holds one ascending reading per date in every series', async () => {
    for (const seed of await load()) {
      for (const series of seed.series) {
        const dates = series.points.map((point) => point.period);
        expect(dates).toEqual([...dates].sort());
        expect(new Set(dates).size).toBe(dates.length);
      }
    }
  });

  it('keeps each figure equal to the number its excerpt quotes', async () => {
    for (const seed of await load()) {
      for (const series of seed.series) {
        for (const point of series.points) {
          const quoted = point.excerpt.split(' | ')[3];
          expect(Number(point.value)).toBeCloseTo(Number(quoted), 8);
        }
      }
    }
  });
});
