import { z } from 'zod';
import { date } from './seed.primitives';

/**
 * Historical parallel exchange rate captured from its publisher.
 *
 * This is not demonstration data: it is a real series, retrieved once from a
 * citable export and versioned here so a deployment loads it without depending
 * on that endpoint being reachable at boot. The provenance block is what makes
 * it auditable — anyone can re-request the same range and compare the digest.
 */

/** A price exactly as the source writes it, never re-formatted through a float. */
const quotedValue = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?$/u, 'a quoted value must be a plain decimal');

export const fxParallelHistorySchema = z.object({
  provenance: z
    .object({
      publisher: z.string().trim().min(2).max(200),
      sourceUrl: z.url(),
      retrievedAt: z.iso.datetime({ offset: false }),
      upstreamSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      /**
       * How each point was reduced to one value per day.
       *
       * The daily bucket is an average of the intraday quotes, which is a
       * different statistic from the point-in-time reading the daily collector
       * records. Carrying it explicitly keeps a chart from silently splicing
       * two different measurements into one line.
       */
      aggregation: z.literal('DAILY_AVERAGE'),
      rangeStart: date,
      rangeEnd: date,
    })
    .strict(),
  points: z
    .array(
      z
        .object({
          date,
          buy: quotedValue,
          sell: quotedValue,
        })
        .strict(),
    )
    .min(1)
    .max(2_000),
});

export type FxParallelHistory = z.infer<typeof fxParallelHistorySchema>;
