import { z } from 'zod';

/**
 * Declared foreign trade, where every year is its own retrieval.
 *
 * The annual macro seeds put the address and the digest on the series, because
 * the compilers behind them answer a whole series in one response. The trade
 * register does not: it refuses more than one period per request, so a
 * series-level digest would name bytes that no single request ever returned
 * and a reader following the address would be handed one year of the many the
 * digest claimed to cover.
 *
 * So provenance moves down to the point. That is not a weaker guarantee than
 * the one above it, it is a stricter one — each figure carries the exact
 * request that produced it — and it is the honest shape for a source that
 * answers a year at a time.
 */

const measuredValue = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?$/u, 'a declared value must be numeric without an exponent');

export const foreignTradeHistorySchema = z.object({
  series: z
    .array(
      z
        .object({
          indicatorCode: z
            .string()
            .regex(/^[A-Z][A-Z0-9_]*$/u)
            .max(60),
          /** Identifier of the flow at the register, so the query is reproducible. */
          compilerCode: z.string().min(3).max(40),
          name: z.string().trim().min(3).max(200),
          /** Declared trade is reported in current dollars and in nothing else. */
          unit: z.literal('USD'),
          publisher: z.string().trim().min(2).max(200),
          frequency: z.literal('ANNUAL'),
          points: z
            .array(
              z
                .object({
                  period: z.string().regex(/^(19|20)\d{2}$/u),
                  value: measuredValue,
                  /** The literal record the value was read from. */
                  excerpt: z.string().min(10).max(4_000),
                  /** The request that returned this year, and only this year. */
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
    .max(10),
});

export type ForeignTradeHistory = z.infer<typeof foreignTradeHistorySchema>;
export type ForeignTradeSeries = ForeignTradeHistory['series'][number];
