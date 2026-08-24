import { z } from 'zod';
import { date } from './seed.primitives';

/**
 * Material events filed with the Bolivian stock exchange.
 *
 * Captured from the exchange's own listing, each filing verified against the
 * page that serves it: the excerpt kept as evidence is a slice of that page,
 * and the stamp is one the page repeats.
 */
export const companyFilingsSchema = z.object({
  provenance: z
    .object({
      publisher: z.string().trim().min(2).max(200),
      listingUrl: z.url(),
      retrievedAt: z.iso.datetime({ offset: false }),
      listingSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .strict(),
  filings: z
    .array(
      z
        .object({
          filer: z.string().trim().min(2).max(250),
          subject: z.string().trim().min(3).max(300),
          /** Stamp exactly as the exchange writes it. */
          statedInstant: z.string().regex(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/u),
          publishedAt: z.iso.datetime({ offset: true }),
          eventDate: date,
          url: z.url(),
          excerpt: z.string().min(20).max(4_000),
          documentSha256: z.string().regex(/^[a-f0-9]{64}$/u),
          /** Whether the filing's own page repeats the stamp the listing showed. */
          statedInDocument: z.boolean(),
        })
        .strict(),
    )
    .min(1)
    .max(500),
});

export type CompanyFilings = z.infer<typeof companyFilingsSchema>;
export type CompanyFiling = CompanyFilings['filings'][number];
