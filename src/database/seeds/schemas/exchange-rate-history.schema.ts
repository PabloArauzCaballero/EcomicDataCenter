import { z } from 'zod';
import { date } from './seed.primitives';

/**
 * Historical exchange rate series captured from its publisher.
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

export const exchangeRateHistorySchema = z.object({
  provenance: z
    .object({
      /** Who published the artifact the series was read from. */
      publisher: z.string().trim().min(2).max(200),
      /**
       * Who produced the figure, when that is not the publisher.
       *
       * The official rate is set by the central bank and republished by the
       * aggregator; attributing it to whoever happened to serve the file would
       * misstate its authority.
       */
      originator: z.string().trim().min(2).max(200).optional(),
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
          /**
           * The literal fragment of the payload this point was read from.
           *
           * Present where the snapshot was captured with it, so the quotation
           * retained as evidence can be found in the bytes the digest covers
           * instead of being a restatement of the parsed values.
           */
          excerpt: z.string().min(10).max(4_000).optional(),
        })
        .strict(),
    )
    .min(1)
    .max(2_000),
});

export type ExchangeRateHistory = z.infer<typeof exchangeRateHistorySchema>;
export type ExchangeRatePoint = ExchangeRateHistory['points'][number];
