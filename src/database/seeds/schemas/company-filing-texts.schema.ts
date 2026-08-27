import { z } from 'zod';

/**
 * The text each filing states on its own page.
 *
 * The exchange's register summarises: its search endpoint returns an `abstract`
 * the exchange itself has already cut short, so a reader who opens a filing in
 * the report gets an ellipsis and no way past it. The filing's own page carries
 * what was actually communicated.
 *
 * This is loaded as a SECOND piece of evidence on claims that already exist,
 * never as a replacement: the register capture stays exactly as it was
 * recorded, and this one cites a different document — the filing's page — with
 * its own digest. Evidence accumulates; it is not rewritten.
 */
export const companyFilingTextsSchema = z.object({
  provenance: z
    .object({
      publisher: z.string().trim().min(2).max(200),
      /** The address pattern each filing's page is served from. */
      documentUrlPattern: z.string().trim().min(10).max(300),
      retrievedAt: z.iso.datetime({ offset: false }),
    })
    .strict(),
  texts: z
    .array(
      z
        .object({
          /** The exchange's identifier, which ties this to the claim already loaded. */
          filingId: z.number().int().positive(),
          /** What the filing says, as its page states it. */
          text: z.string().trim().min(20).max(6_000),
          /** Digest of that page, so the text can be checked against the source. */
          documentSha256: z.string().regex(/^[a-f0-9]{64}$/u),
        })
        .strict(),
    )
    .min(1)
    .max(5_000),
});

export type CompanyFilingTexts = z.infer<typeof companyFilingTextsSchema>;
export type CompanyFilingText = CompanyFilingTexts['texts'][number];
