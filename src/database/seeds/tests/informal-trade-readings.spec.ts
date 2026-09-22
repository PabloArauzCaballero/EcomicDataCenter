import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  businessFormCase,
  goodsClassCase,
  settlementCase,
  territoryCase,
  tradeSideCase,
} from '../../migration-sql/0065-read-trade-by-form.lexicon';
import { socialReadingsSchema } from '../schemas/social-readings.schema';

/**
 * Holds the commerce catalogue to the vocabulary that files it by form of trade.
 *
 * Migration 0065 reads a reading's label and decides whether the sale happened
 * in a popular fair or in a mall. That decision is only as good as the labels:
 * a reading written as "canal informal" would fall into `NINGUNA` and quietly
 * vanish from every panel, and nothing in a running system would report it —
 * the row is still there, still correct, and simply never counted.
 *
 * So the classification runs here, against the same expressions the migration
 * installs, with no database. `\m` is Postgres' start-of-word and `\b` is its
 * JavaScript equivalent, which is the only translation this needs.
 */
describe('informal trade readings', () => {
  const load = async () =>
    socialReadingsSchema.parse(
      JSON.parse(await readFile(join(__dirname, '..', 'boot', 'social-readings.json'), 'utf8')),
    );

  const branches = (sqlCase: string): ReadonlyArray<readonly [string, readonly RegExp[]]> =>
    [...sqlCase.matchAll(/WHEN named ~ ANY \(ARRAY\[([\s\S]*?)]\) THEN '([A-Z_]+)'/g)].map(
      ([, list = '', value = '']) =>
        [
          value,
          [...list.matchAll(/'([^']*)'/g)].map(
            ([, pattern = '']) => new RegExp(pattern.replace(/\\m|\\M/g, '\\b'), 'u'),
          ),
        ] as const,
    );

  const named = (label: string): string =>
    label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/gu, '');

  const file = (sqlCase: string, label: string, fallback: string): string => {
    for (const [value, patterns] of branches(sqlCase)) {
      if (patterns.some((pattern) => pattern.test(named(label)))) return value;
    }
    return fallback;
  };

  const commerce = async () => (await load()).readings.filter((r) => r.subject === 'COMMERCE');

  it('files each channel reading under the form of trade its label names', async () => {
    const readings = await commerce();
    const formOf = (metric: string): string => {
      const reading = readings.find((candidate) => candidate.metric === metric);
      expect(reading).toBeDefined();
      return file(businessFormCase, reading?.label ?? '', 'NINGUNA');
    };

    expect(formOf('CLOTHING_CHANNEL_POPULAR_FAIRS')).toBe('FERIA_POPULAR');
    expect(formOf('CLOTHING_CHANNEL_TRADITIONAL_MARKETS')).toBe('MERCADO_TRADICIONAL');
    expect(formOf('CLOTHING_CHANNEL_SHOPPING_MALLS')).toBe('CENTRO_COMERCIAL');
    expect(formOf('CLOTHING_CHANNEL_BOUTIQUES')).toBe('BOUTIQUE');
    expect(formOf('CLOTHING_CHANNEL_CATALOGUES')).toBe('VENTA_CATALOGO');
    expect(formOf('SMALL_FORMAT_SPEND_SHARE')).toBe('TIENDA_BARRIO');
    expect(formOf('MODERN_CHANNEL_HOUSEHOLD_REACH')).toBe('SUPERMERCADO');
    expect(formOf('PURCHASE_ORIGIN_MARKETPLACE')).toBe('COMERCIO_SOCIAL');
    expect(formOf('CONTRABAND_ANNUAL_VALUE')).toBe('CONTRABANDO');
    expect(formOf('OWN_ACCOUNT_WORKERS_SHARE')).toBe('CUENTA_PROPIA');
    expect(formOf('FAIR_WEEKLY_TURNOVER')).toBe('FERIA_POPULAR');
  });

  it('holds at least one reading for every informal form of doing business', async () => {
    const readings = await commerce();
    const forms = new Set(readings.map((r) => file(businessFormCase, r.label, 'NINGUNA')));

    // The formal channels were always covered: a household panel measures malls
    // and supermarkets every year. What this register was widened for is the
    // other side, and losing any one of these would leave the panel describing
    // the smaller half of the country's trade as if it were all of it.
    for (const form of [
      'FERIA_POPULAR',
      'MERCADO_TRADICIONAL',
      'TIENDA_BARRIO',
      'CUENTA_PROPIA',
      'CONTRABANDO',
    ]) {
      expect(forms).toContain(form);
    }
    expect(forms.size).toBeGreaterThanOrEqual(9);
  });

  it('separates who buys, who sells, what it costs to trade and what carries it', async () => {
    const readings = await commerce();
    const sides = new Set(readings.map((r) => file(tradeSideCase, r.label, 'NINGUNO')));

    // A fair's weekly turnover and a household's channel penetration are both
    // "commerce" and cannot be averaged. If every reading landed on one side,
    // the panel would be a single column wearing four names.
    expect(sides).toContain('DEMANDA');
    expect(sides).toContain('OFERTA');
    expect(sides).toContain('INFRAESTRUCTURA');
    expect(sides).toContain('FRICCION');
  });

  it('reads how the money changes hands wherever the label says so', async () => {
    const readings = await commerce();
    const settlements = new Set(readings.map((r) => file(settlementCase, r.label, 'NINGUNO')));

    // The dimension that tells an informal sale from a formal one: the same
    // purchase can be found on Instagram and settled in cash at the door.
    expect(settlements).toContain('QR');
    expect(settlements).toContain('EFECTIVO');
    expect(settlements).toContain('CONTRA_ENTREGA');
    expect(settlements).toContain('TRANSFERENCIA');
  });

  it('keeps readings that describe somewhere other than the whole country', async () => {
    const readings = await commerce();
    const places = new Set(readings.map((r) => file(territoryCase, r.label, 'NACIONAL')));

    // Informal trade in El Alto is not informal trade in Santa Cruz. A register
    // that only holds national averages cannot say so.
    expect(places.size).toBeGreaterThanOrEqual(4);
    expect(places).toContain('EL_ALTO');
    expect(places).toContain('URBANO');
  });

  it('files the clothing basket apart from everything else it is compared with', async () => {
    const readings = await commerce();
    const clothing = readings.filter(
      (r) => file(goodsClassCase, r.label, 'TRANSVERSAL') === 'ROPA',
    );

    // The one basket measured across six channels by a single compiler in a
    // single year: the only place where adding the channels up says anything.
    expect(clothing.length).toBeGreaterThanOrEqual(6);
    for (const reading of clothing) {
      expect(reading.unit).toBe('PERCENT');
    }
  });
});
