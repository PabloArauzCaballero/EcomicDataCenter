import { z } from 'zod';
import { date } from './seed.primitives';

/**
 * Daily closes for the markets that bear on the Bolivian dollar.
 *
 * These are quotations, not official statistics, and they sit at the same tier
 * as the parallel-rate venue rather than beside a central-bank table. What they
 * add is the part of the dollar question that Bolivian official data cannot
 * answer: with the official rate rationed, USDT is a channel through which
 * dollars are actually obtained, so whether its peg holds is a fact about the
 * parallel market. Gold is the reserve asset the country's position is measured
 * against.
 *
 * The gold series is a tokenised claim on allocated bullion, and its name says
 * so. It tracks spot closely and it is not the London fix; a reader comparing
 * it to a central-bank valuation should know which one they are holding.
 */
export const marketPricesSchema = z.object({
  series: z
    .array(
      z
        .object({
          indicatorCode: z
            .string()
            .regex(/^[A-Z][A-Z0-9_]*$/u)
            .max(60),
          name: z.string().trim().min(3).max(200),
          unit: z.string().trim().min(2).max(20),
          /** What the reader needs to know before comparing this to anything. */
          note: z.string().trim().min(10).max(300),
          provenance: z
            .object({
              publisher: z.string().trim().min(2).max(200),
              sourceUrl: z.url(),
              retrievedAt: z.iso.datetime({ offset: false }),
              upstreamSha256: z.string().regex(/^[a-f0-9]{64}$/u),
              frequency: z.literal('DAILY'),
            })
            .strict(),
          points: z
            .array(
              z
                .object({
                  date,
                  close: z.string().regex(/^-?\d+(\.\d+)?$/u),
                  low: z.string().regex(/^-?\d+(\.\d+)?$/u),
                  high: z.string().regex(/^-?\d+(\.\d+)?$/u),
                  /** The verbatim candle the figures were read from. */
                  excerpt: z.string().min(10).max(600),
                })
                .strict(),
            )
            .min(30)
            .max(4_000),
        })
        .strict(),
    )
    .min(1)
    .max(20),
});

export type MarketPrices = z.infer<typeof marketPricesSchema>;
export type MarketSeries = MarketPrices['series'][number];
