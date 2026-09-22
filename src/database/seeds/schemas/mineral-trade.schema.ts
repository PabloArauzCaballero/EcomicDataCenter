import { z } from 'zod';

/**
 * Lo exportado por partida arancelaria, en dólares y en kilos.
 *
 * Hereda de `foreign-trade-history` la decisión que importa: la procedencia va
 * en el punto y no en la serie, porque el registro responde un año por
 * petición y una huella a nivel de serie nombraría bytes que ninguna petición
 * devolvió nunca.
 *
 * Lo que añade es una segunda unidad. El valor en dólares de una exportación
 * mezcla precio y volumen —el mismo oro con el precio duplicado vale el doble—
 * y el peso neto que el registro declara al lado separa las dos cosas. Son dos
 * series por partida y no dos columnas de una: cada una tiene su propia
 * cobertura, porque las declaraciones viejas traen el valor y callan el peso.
 *
 * `hsCode`, `level` y `family` viajan con la serie porque son propiedades del
 * dato y no del dibujo. `level` en particular: el capítulo 26 entero está en el
 * corpus junto a sus partidas, y quien las sume todas contaría lo mismo dos
 * veces. Decirlo en el archivo es más barato que esperar que cada lector lo
 * deduzca del código arancelario.
 */

const measuredValue = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/u, 'lo declarado es una cantidad positiva sin exponente');

export const mineralTradeSchema = z.object({
  series: z
    .array(
      z
        .object({
          indicatorCode: z
            .string()
            .regex(/^COMMODITY_EXPORTS_[A-Z0-9_]+_(USD|KG)$/u)
            .max(60),
          /** La partida del Sistema Armonizado, para reproducir la consulta. */
          hsCode: z.string().regex(/^\d{2,6}$/u),
          /** Si la serie es un capítulo entero o una de sus partidas. */
          level: z.enum(['TOTAL', 'LINE']),
          family: z.enum(['MINERAL', 'METAL', 'QUIMICO', 'HIDROCARBURO']),
          name: z.string().trim().min(3).max(200),
          /** Dólares corrientes declarados, o kilos de peso neto. */
          unit: z.enum(['USD', 'KG']),
          publisher: z.string().trim().min(2).max(200),
          frequency: z.literal('ANNUAL'),
          points: z
            .array(
              z
                .object({
                  period: z.string().regex(/^(19|20)\d{2}$/u),
                  value: measuredValue,
                  /** La fila del registro de la que salió esta cifra, y sólo ella. */
                  excerpt: z.string().min(10).max(4_000),
                  /** La petición que devolvió este año. */
                  sourceUrl: z.url(),
                  upstreamSha256: z.string().regex(/^[a-f0-9]{64}$/u),
                  retrievedAt: z.iso.datetime({ offset: false }),
                })
                .strict(),
            )
            .min(1)
            .max(120),
        })
        .strict(),
    )
    .min(1)
    .max(40),
});

export type MineralTrade = z.infer<typeof mineralTradeSchema>;
export type MineralTradeSeries = MineralTrade['series'][number];
