import { z } from 'zod';
import { date } from './seed.primitives';

/**
 * The quotations the Banco Central publishes on its own front page.
 *
 * The UFV is the unit half of Bolivian contracts are written in, and the gold
 * valuation is the number the country's reserves are marked against. Both come
 * from the institution that defines them, which is why they sit here rather
 * than being approximated from an exchange.
 *
 * The bank publishes the day's table and no archive reachable without driving a
 * form, so this file accumulates one day at a time and its history begins where
 * the collector did. That is stated rather than disguised: a series that starts
 * on a Tuesday because that is when someone first looked is honest; one padded
 * backwards from an estimate is not.
 */
export const bcbQuotesSchema = z.object({
  quotes: z
    .array(
      z
        .object({
          indicatorCode: z
            .string()
            .regex(/^[A-Z][A-Z0-9_]*$/u)
            .max(60),
          indicatorName: z.string().trim().min(3).max(200),
          unit: z.string().trim().min(2).max(20),
          eventDate: date,
          value: z.string().regex(/^\d+(\.\d+)?$/u),
          /** The figure exactly as the bank prints it, dots and comma included. */
          statedValue: z.string().trim().min(1).max(40),
          /** The literal fragment of the page the figure was read from. */
          excerpt: z.string().trim().min(5).max(300),
          sourceUrl: z.url(),
          documentSha256: z.string().regex(/^[a-f0-9]{64}$/u),
          retrievedAt: z.iso.datetime({ offset: false }),
        })
        .strict(),
    )
    .min(1)
    .max(5_000),
});

export type BcbQuotes = z.infer<typeof bcbQuotesSchema>;
export type BcbQuote = BcbQuotes['quotes'][number];
