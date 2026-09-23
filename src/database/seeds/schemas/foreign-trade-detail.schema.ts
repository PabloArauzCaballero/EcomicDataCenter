import { z } from 'zod';

/**
 * El comercio exterior declarado, desglosado por socio y por producto.
 *
 * Hereda de `foreign-trade-history` la decisión que importa: la procedencia va
 * en el punto y no en la serie, porque el registro responde un año por
 * petición y una huella a nivel de serie nombraría bytes que ninguna petición
 * devolvió nunca. Cada archivo trae un desglose, no los dos cruzados — ver el
 * comentario de cabecera de `collect-comtrade-trade-detail.ts` para por qué el
 * cruce completo no se pide.
 *
 * Sólo se publican los socios y los productos con más valor acumulado en el
 * periodo, no todos los que el registro declara. `partnerCode`/`hsCode` viajan
 * con la serie porque son propiedades del dato, no del dibujo: quien lea estas
 * series desde otro sitio necesita el código exacto que se pidió, y el nombre
 * es el que el propio registro publica (en inglés, tal como lo declara).
 */

const measuredValue = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/u, 'una declaración de comercio es una cantidad positiva sin exponente');

const point = z
  .object({
    period: z.string().regex(/^(19|20)\d{2}$/u),
    value: measuredValue,
    /** La fila del registro de la que salió esta cifra, y sólo ella. */
    excerpt: z.string().min(10).max(4_000),
    /** La petición que devolvió este año para este flujo. */
    sourceUrl: z.url(),
    upstreamSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    retrievedAt: z.iso.datetime({ offset: false }),
  })
  .strict();

const flowCode = z.enum(['X', 'M']);

export const foreignTradePartnersSchema = z.object({
  series: z
    .array(
      z
        .object({
          indicatorCode: z
            .string()
            .regex(/^COMTRADE_PARTNER_[A-Z]_[A-Z0-9]{1,12}_USD$/u)
            .max(60),
          flowCode,
          /** El código del socio en la lista de países del registro (M49/Comtrade). */
          partnerCode: z.number().int().min(1).max(998),
          /** El nombre del socio tal como lo publica el registro. */
          partnerName: z.string().trim().min(2).max(200),
          name: z.string().trim().min(3).max(400),
          /** El comercio declarado se publica en dólares corrientes y en nada más. */
          unit: z.literal('USD'),
          publisher: z.string().trim().min(2).max(200),
          frequency: z.literal('ANNUAL'),
          points: z.array(point).min(1).max(120),
        })
        .strict(),
    )
    .min(1)
    .max(60),
});

export const foreignTradeProductsSchema = z.object({
  series: z
    .array(
      z
        .object({
          indicatorCode: z
            .string()
            .regex(/^COMTRADE_PRODUCT_[A-Z]_HS\d{2}_USD$/u)
            .max(60),
          flowCode,
          /** El capítulo de dos dígitos del Sistema Armonizado. */
          hsCode: z.string().regex(/^\d{2}$/u),
          /** El nombre del capítulo tal como lo publica el registro. */
          hsName: z.string().trim().min(2).max(300),
          name: z.string().trim().min(3).max(500),
          unit: z.literal('USD'),
          publisher: z.string().trim().min(2).max(200),
          frequency: z.literal('ANNUAL'),
          points: z.array(point).min(1).max(120),
        })
        .strict(),
    )
    .min(1)
    .max(60),
});

export type ForeignTradePartners = z.infer<typeof foreignTradePartnersSchema>;
export type ForeignTradePartnerSeries = ForeignTradePartners['series'][number];
export type ForeignTradeProducts = z.infer<typeof foreignTradeProductsSchema>;
export type ForeignTradeProductSeries = ForeignTradeProducts['series'][number];
