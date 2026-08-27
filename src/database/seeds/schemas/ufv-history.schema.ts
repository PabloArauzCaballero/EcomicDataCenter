import { z } from 'zod';
import { date } from './seed.primitives';

/**
 * The whole life of the Unidad de Fomento de Vivienda, as its issuer publishes it.
 *
 * The UFV is not a market price: the Banco Central computes it from the
 * consumer price index and publishes one value per calendar day, including the
 * days no market opens, and including a short stretch of days ahead of today
 * because contracts settling next week need to know the unit now. So the series
 * is dense and it legitimately runs past the date it was collected — neither is
 * a defect to be trimmed away.
 *
 * Grouped by calendar year rather than held flat, because each year is its own
 * retrieval with its own digest. A closed year never changes, so re-collecting
 * rewrites only the running one.
 */

/** Bolivianos per unit, to the eighteen decimal places the bank answers with. */
const statedValue = z.string().regex(/^\d+\.\d+$/u);

export const ufvHistorySchema = z.object({
  years: z
    .array(
      z
        .object({
          period: z.string().regex(/^(?:19|20)\d{2}$/u),
          sourceUrl: z.url(),
          documentSha256: z.string().regex(/^[a-f0-9]{64}$/u),
          retrievedAt: z.iso.datetime({ offset: false }),
          points: z
            .array(
              z
                .object({
                  eventDate: date,
                  /** Normalised for arithmetic: the padding zeros removed, nothing else. */
                  value: z.string().regex(/^\d+(?:\.\d+)?$/u),
                  /** The figure exactly as the bank writes it, padding included. */
                  statedValue,
                  /** The literal record the value was read from. */
                  excerpt: z.string().trim().min(5).max(300),
                })
                .strict(),
            )
            .min(1)
            .max(400),
        })
        .strict(),
    )
    .min(1)
    .max(60),
});

export type UfvHistory = z.infer<typeof ufvHistorySchema>;
export type UfvYear = UfvHistory['years'][number];
export type UfvPoint = UfvYear['points'][number];
