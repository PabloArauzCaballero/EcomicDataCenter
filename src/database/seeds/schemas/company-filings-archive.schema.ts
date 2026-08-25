import { z } from 'zod';
import { date } from './seed.primitives';

/**
 * The exchange's archive of material events, as its own search endpoint serves it.
 *
 * The public listing page renders only the five most recent filings, and every
 * one of them is filed by the exchange itself, which is why the first capture
 * showed a single filer and no industry at all. The endpoint the page calls
 * behind it returns the whole register: the issuer's registered name, the code
 * the exchange assigns it, the subject and the stamp. That is the difference
 * between "the exchange published five notices" and "ninety-three companies
 * across banking, energy, mining, agro-industry and manufacturing filed six
 * hundred facts", which is the question a reader actually has.
 *
 * Provenance differs from the page-per-filing snapshot alongside it. Here the
 * document is one page of the endpoint's response, so the digest is of that
 * response and the excerpt is the verbatim JSON record the figure was read
 * from. The filing's own page is still cited as the locator, so a reader can
 * open it, but it is not claimed to have been fetched — it was not.
 */
export const companyFilingsArchiveSchema = z.object({
  provenance: z
    .object({
      publisher: z.string().trim().min(2).max(200),
      listingUrl: z.url(),
      /** The endpoint the listing page queries for anything past the fifth row. */
      endpointUrl: z.url(),
      /** The request shape, so the capture can be reproduced. */
      query: z.string().trim().min(10).max(300),
      retrievedAt: z.iso.datetime({ offset: false }),
    })
    .strict(),
  filings: z
    .array(
      z
        .object({
          /** The exchange's own identifier, and what makes a filing unique. */
          filingId: z.number().int().positive(),
          /** Short code the exchange assigns the issuer. */
          filerCode: z.string().trim().min(1).max(40),
          /** Registered name of the company that filed, not of the exchange. */
          filer: z.string().trim().min(2).max(250),
          subject: z.string().trim().min(3).max(300),
          /** Stamp exactly as the endpoint writes it, before any offset is applied. */
          statedInstant: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u),
          publishedAt: z.iso.datetime({ offset: true }),
          eventDate: date,
          url: z.url(),
          /** Which page of the response carried it. */
          page: z.number().int().positive(),
          /** Digest of that page, so the record can be checked against the source. */
          pageSha256: z.string().regex(/^[a-f0-9]{64}$/u),
          /** The verbatim record the fields were read from. */
          excerpt: z.string().min(20).max(4_000),
        })
        .strict(),
    )
    .min(1)
    .max(5_000),
});

export type CompanyFilingsArchive = z.infer<typeof companyFilingsArchiveSchema>;
export type ArchivedFiling = CompanyFilingsArchive['filings'][number];
