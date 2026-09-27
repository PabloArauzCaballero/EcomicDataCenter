import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ungroundedMeasures } from '../../../common/economic-indicators/indicator-codes';
import {
  foreignTradePartnersSchema,
  foreignTradeProductsSchema,
} from '../schemas/foreign-trade-detail.schema';

/**
 * Guarda el desglose del comercio exterior por socio y por producto.
 *
 * El total nacional ya tenía sus propias pruebas; estas cubren lo que el
 * desglose añade y que el total no puede romper por descuido: que cada serie
 * quede atada a un flujo y a una dimensión concretos, que el socio «Mundo» no
 * se cuele disfrazado de socio, y que ningún capítulo salga sin su código de
 * dos dígitos.
 */

const boot = (file: string) => join(__dirname, '..', 'boot', file);
const readJson = async (file: string): Promise<unknown> =>
  JSON.parse(await readFile(boot(file), 'utf8'));

const lastCompletedYear = new Date().getUTCFullYear() - 1;

describe('comercio exterior por socio', () => {
  const load = async () =>
    foreignTradePartnersSchema.parse(await readJson('foreign-trade-partners.json'));

  it('trae ambos flujos y ningún socio repetido dentro de un flujo', async () => {
    const history = await load();
    const flows = new Set(history.series.map((series) => series.flowCode));
    expect(flows).toEqual(new Set(['X', 'M']));

    for (const flow of ['X', 'M'] as const) {
      const partnerCodes = history.series
        .filter((series) => series.flowCode === flow)
        .map((series) => series.partnerCode);
      expect(new Set(partnerCodes).size).toBe(partnerCodes.length);
    }
  });

  it('nunca publica al Mundo como si fuera un socio', async () => {
    const history = await load();
    for (const series of history.series) expect(series.partnerCode).not.toBe(0);
  });

  it('cada punto cita la petición que lo trajo y no proyecta un año sin cerrar', async () => {
    const history = await load();
    for (const series of history.series) {
      for (const point of series.points) {
        expect(point.sourceUrl).toContain(`period=${point.period}`);
        expect(point.sourceUrl).toContain(`flowCode=${series.flowCode}`);
        expect(Number(point.period)).toBeLessThanOrEqual(lastCompletedYear);
      }
    }
  });

  it('respalda cada cifra en el registro citado', async () => {
    const history = await load();
    for (const series of history.series) {
      for (const point of series.points) {
        const measures = [
          { indicatorCode: series.indicatorCode, priceSide: null, value: point.value, unit: 'USD' },
        ];
        expect(ungroundedMeasures(measures, point.excerpt)).toEqual([]);
      }
    }
  });
});

describe('comercio exterior por producto', () => {
  const load = async () =>
    foreignTradeProductsSchema.parse(await readJson('foreign-trade-products.json'));

  it('identifica cada serie con un capítulo de dos dígitos, sin repetirlo por flujo', async () => {
    const history = await load();
    for (const series of history.series) expect(series.hsCode).toMatch(/^\d{2}$/u);

    for (const flow of ['X', 'M'] as const) {
      const chapters = history.series
        .filter((series) => series.flowCode === flow)
        .map((series) => series.hsCode);
      expect(new Set(chapters).size).toBe(chapters.length);
    }
  });

  it('respalda cada cifra en el registro citado, en dólares únicamente', async () => {
    const history = await load();
    for (const series of history.series) {
      expect(series.unit).toBe('USD');
      for (const point of series.points) {
        const measures = [
          { indicatorCode: series.indicatorCode, priceSide: null, value: point.value, unit: 'USD' },
        ];
        expect(ungroundedMeasures(measures, point.excerpt)).toEqual([]);
        expect(Number(point.period)).toBeLessThanOrEqual(lastCompletedYear);
      }
    }
  });
});
