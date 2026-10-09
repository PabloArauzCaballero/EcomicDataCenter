import { z } from 'zod';

/**
 * Los precios que Bolivia no fija: cotizaciones mundiales, de los vecinos,
 * índices de productor, precios en bolivianos en sus mercados y el valor
 * unitario de lo que declaró en aduana.
 *
 * Dos archivos comparten esta forma: `exogenous-prices.json`, mensual, donde
 * cada serie sale de UNA descarga y la procedencia va en la serie; y
 * `exogenous-customs.json`, anual, donde cada año es otra descarga y la
 * procedencia va en el punto. El esquema admite las dos y exige que cada punto
 * pueda decir de dónde salió por una de las dos vías.
 *
 * `scope` viaja con el dato y no con el dibujo por la misma razón que `level`
 * en las partidas: un índice de productor y un precio en dólares por tonelada
 * no se pueden poner en el mismo eje, y quien lo decide aguas abajo tiene que
 * poder leerlo sin adivinarlo por el nombre.
 *
 * `tradeValueUsd` y `netWeightKg` sólo existen en las lecturas de aduana: son
 * las dos cifras literales del registro, y `value` es su cociente.
 */

const measured = z.string().regex(/^-?\d+(?:\.\d+)?$/u, 'una cantidad decimal sin exponente');

const provenance = z
  .object({
    sourceUrl: z.url(),
    upstreamSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    retrievedAt: z.iso.datetime({ offset: false }),
  })
  .strict();

const point = z
  .object({
    period: z.string().regex(/^(?:19|20)\d{2}(?:-(?:0[1-9]|1[0-2]))?$/u),
    value: measured,
    /** La celda, la línea o la fila de la que salió esta cifra. */
    excerpt: z.string().min(8).max(4_000),
    tradeValueUsd: measured.optional(),
    netWeightKg: measured.optional(),
    sourceUrl: z.url().optional(),
    upstreamSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    retrievedAt: z.iso.datetime({ offset: false }).optional(),
  })
  .strict();

export const EXOGENOUS_GROUPS = [
  'ENERGY',
  'MINERALS',
  'AGRICULTURE',
  'LIVESTOCK',
  'INDUSTRY',
  'CONSTRUCTION',
  'FREIGHT',
] as const;

const series = z
  .object({
    indicatorCode: z
      .string()
      .regex(/^EXO_[A-Z0-9_]+$/u)
      .max(80),
    group: z.enum(EXOGENOUS_GROUPS),
    product: z
      .string()
      .regex(/^[A-Z_]+$/u)
      .max(40),
    productLabel: z.string().trim().min(2).max(80),
    name: z.string().trim().min(3).max(200),
    scope: z.enum(['WORLD', 'REGIONAL', 'US_PRODUCER_INDEX', 'BOLIVIA_MARKET', 'BOLIVIA_CUSTOMS']),
    market: z.string().trim().min(2).max(120),
    unit: z.string().trim().min(2).max(40),
    kind: z.enum(['PRICE', 'INDEX']),
    note: z.string().trim().min(5).max(400),
    publisher: z.string().trim().min(2).max(200),
    frequency: z.enum(['MONTHLY', 'ANNUAL']),
    provenance: provenance.optional(),
    points: z.array(point).min(1).max(420),
  })
  .strict()
  .superRefine((one, context) => {
    const monthly = one.frequency === 'MONTHLY';
    for (const [index, entry] of one.points.entries()) {
      if (entry.period.includes('-') !== monthly) {
        context.addIssue({
          code: 'custom',
          path: ['points', index, 'period'],
          message: `${entry.period} no es un periodo ${monthly ? 'mensual' : 'anual'}`,
        });
      }
      const own = entry.sourceUrl && entry.upstreamSha256 && entry.retrievedAt;
      if (!own && !one.provenance) {
        context.addIssue({
          code: 'custom',
          path: ['points', index],
          message: 'el punto no dice de qué descarga salió',
        });
      }
    }
  });

export const exogenousPricesSchema = z.object({
  series: z.array(series).min(1).max(200),
});

export type ExogenousPrices = z.infer<typeof exogenousPricesSchema>;
export type ExogenousSeries = ExogenousPrices['series'][number];
export type ExogenousPoint = ExogenousSeries['points'][number];

/**
 * El boliviano frente a otras monedas, una lectura por moneda y día.
 *
 * Misma forma de serie y mismo sembrador que los precios mensuales, y por eso
 * la misma vista (`read_models.exogenous_price`): lo que cambia es el periodo,
 * que aquí es una fecha, y el tope de puntos, porque son quince años. Cada
 * punto lleva su procedencia —la tabla del BCB de ese día—, como en
 * `exogenous-customs.json`, donde cada año es otra descarga.
 *
 * El grupo `CURRENCY` queda fuera de `EXOGENOUS_GROUPS`: es el capítulo de tipo
 * de cambio, no una pestaña de precios del mundo, y el tablero de exógenas no
 * lo pide.
 */
const currencyPoint = z
  .object({
    period: z.string().regex(/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u),
    value: measured,
    excerpt: z.string().min(8).max(400),
    sourceUrl: z.url(),
    upstreamSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    retrievedAt: z.iso.datetime({ offset: false }),
  })
  .strict();

const currencySeries = z
  .object({
    indicatorCode: z.string().regex(/^EXO_FX_[A-Z]{3}$/u),
    group: z.literal('CURRENCY'),
    product: z.string().regex(/^[A-Z]{3}$/u),
    productLabel: z.string().trim().min(2).max(80),
    name: z.string().trim().min(3).max(200),
    scope: z.literal('BCB_OFFICIAL'),
    market: z.string().trim().min(2).max(120),
    unit: z.string().trim().min(2).max(40),
    kind: z.literal('PRICE'),
    note: z.string().trim().min(5).max(400),
    publisher: z.string().trim().min(2).max(200),
    frequency: z.literal('DAILY'),
    points: z.array(currencyPoint).min(1).max(8_000),
  })
  .strict();

export const currencyRatesSchema = z.object({ series: z.array(currencySeries).min(1).max(30) });

export type CurrencyRates = z.infer<typeof currencyRatesSchema>;
export type CurrencySeries = CurrencyRates['series'][number];
