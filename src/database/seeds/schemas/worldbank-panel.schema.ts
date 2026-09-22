import { z } from 'zod';

/**
 * The World Development Indicators as a panel, for Bolivia and the economies it
 * is read against.
 *
 * Every point is one figure the World Bank publishes for one country in one
 * year. The catalogue is stored as compact triples rather than as objects with
 * named fields: at a million observations the field names are ninety per cent
 * of the file, and the shape a loader wants is not the shape a file should
 * hold.
 *
 * The digest is per series and never per corpus. What makes a figure checkable
 * is that a reader can fetch the address beside it and hash the same bytes; a
 * digest over the whole panel proves nothing about any one series in it.
 */

/** Country, year, value — the order the collector writes and the loader reads. */
const point = z.tuple([
  z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/u),
  z.int().min(1960).max(2100),
  z.number(),
]);

const series = z
  .object({
    /**
     * The publisher's own code, which is what makes two compilers meet.
     *
     * Case is not normalised. Most of the collection is upper case and a
     * handful of series — the social-protection ones, `per_allsp.cov_pop_tot`
     * and its family — are lower case, and that is how the World Bank serves
     * them. Upper-casing here would produce a code that does not resolve at the
     * address stored beside it, which is the one property this register cannot
     * give up.
     */
    indicatorCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,59}$/u),
    indicatorName: z.string().trim().min(3).max(400),
    sourceUrl: z.url(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
    points: z.array(point).min(1).max(5_000),
  })
  .strict();

export const worldBankPanelSchema = z
  .object({
    provenance: z
      .object({
        recordedAt: z.iso.datetime({ offset: false }),
        publisher: z.string().trim().min(3).max(120),
        domain: z
          .string()
          .trim()
          .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/u),
      })
      .strict(),
    countries: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[A-Z]{3}$/u),
      )
      .min(1)
      .max(60),
    series: z.array(series).min(1).max(400),
  })
  .strict();

export type WorldBankPanel = z.infer<typeof worldBankPanelSchema>;
export type WorldBankPanelSeries = WorldBankPanel['series'][number];
