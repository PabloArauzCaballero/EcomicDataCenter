import { z } from 'zod';
import { date } from './seed.primitives';

/**
 * Bolivian news coverage recovered from the public web archive.
 *
 * The outlets' feeds carry twenty-five items each. The archive carries what
 * they published for years, which is the difference between a snapshot of this
 * week's mood and a record of what the country has been talking about since
 * 2020 — the span that contains the shortage, the gap opening and the
 * realignment.
 *
 * Two things about these records are weaker than a feed's, and both are stated
 * on every row rather than smoothed over.
 *
 * The headline is reconstructed from the address the outlet published under.
 * News addresses spell their headline out, so the words are the outlet's own,
 * but the accents and the capitalisation are not: `dolar` may have been
 * `dólar`. That is enough to measure what a country is talking about and not
 * enough to quote, and the model marks it so nothing quotes it.
 *
 * The date is the day the outlet published where the address states one, and
 * otherwise the day the archive first captured the page — which is at or after
 * publication, never before. Each row says which of the two it is.
 */
export const pressArchiveSchema = z.object({
  provenance: z
    .object({
      publisher: z.string().trim().min(2).max(200),
      /** The index the records were read from. */
      indexUrl: z.url(),
      retrievedAt: z.iso.datetime({ offset: false }),
      /** Calendar year this file covers, so a reader knows what is missing. */
      year: z.number().int().min(2000).max(2100),
    })
    .strict(),
  articles: z
    .array(
      z
        .object({
          outlet: z.string().trim().min(2).max(120),
          domain: z
            .string()
            .trim()
            .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/u)
            .max(120),
          /** Reconstructed from the address; the words are the outlet's, the accents are not. */
          headline: z.string().trim().min(12).max(280),
          url: z.url(),
          eventDate: date,
          /** URL when the address states the day; ARCHIVO when it is the capture day. */
          dateBasis: z.enum(['URL', 'ARCHIVO']),
          /** When the archive captured it, in the index's own stamp format. */
          archiveTimestamp: z.string().regex(/^\d{14}$/u),
          /** The permanent snapshot, which is what a reader opens to check. */
          archiveUrl: z.url(),
          /** The verbatim index record the fields were read from. */
          excerpt: z.string().trim().min(20).max(900),
        })
        .strict(),
    )
    .min(1)
    .max(200_000),
});

export type PressArchive = z.infer<typeof pressArchiveSchema>;
export type ArchivedArticle = PressArchive['articles'][number];
