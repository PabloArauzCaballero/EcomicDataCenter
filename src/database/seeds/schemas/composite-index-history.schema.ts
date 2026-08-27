import { z } from 'zod';

/**
 * Composite indices, which rate a country rather than measure it.
 *
 * These are constructions, not counts: someone chose the components and the
 * weights, and a reader who does not know whose construction it is cannot read
 * the number. So this schema, unlike the one for measured series, insists on
 * two organisations rather than one — the institution that builds the index and
 * the archive the bytes were fetched from — and on the heading of the column
 * the value was taken from, because a redistributed table gains and loses
 * columns and reading the wrong one yields a real number that means something
 * else entirely.
 */

const measuredValue = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?$/u, 'a rated value must be numeric without an exponent');

export const compositeIndexHistorySchema = z.object({
  series: z
    .array(
      z
        .object({
          indicatorCode: z
            .string()
            .regex(/^[A-Z][A-Z0-9_]*$/u)
            .max(60),
          name: z.string().trim().min(3).max(200),
          /**
           * `INDEX` is a continuous rating; `SCORE` is a discrete or centred
           * scale that must never be drawn as if it were a percentage.
           */
          unit: z.enum(['INDEX', 'SCORE']),
          provenance: z
            .object({
              /** The institution that constructs the index. */
              publisher: z.string().trim().min(2).max(200),
              /** The archive the bytes came from, which is not the publisher. */
              distributor: z.string().trim().min(2).max(200),
              sourceUrl: z.url(),
              /** Heading of the column the value was read from. */
              valueColumn: z.string().trim().min(2).max(120),
              retrievedAt: z.iso.datetime({ offset: false }),
              upstreamSha256: z.string().regex(/^[a-f0-9]{64}$/u),
              frequency: z.literal('ANNUAL'),
            })
            .strict(),
          points: z
            .array(
              z
                .object({
                  /** Calendar year the rating describes. */
                  period: z.string().regex(/^(?:1[89]|20)\d{2}$/u),
                  value: measuredValue,
                  /** The literal row the value was read from. */
                  excerpt: z.string().trim().min(5).max(1_000),
                })
                .strict(),
            )
            .min(1)
            // Two centuries of annual ratings: the political series reach 1825.
            .max(300),
        })
        .strict(),
    )
    .min(1)
    .max(40),
});

export type CompositeIndexHistory = z.infer<typeof compositeIndexHistorySchema>;
export type CompositeIndexSeries = CompositeIndexHistory['series'][number];
