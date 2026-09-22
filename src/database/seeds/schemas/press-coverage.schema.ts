import { z } from 'zod';

/**
 * What the Bolivian press published, as its own feeds serve it.
 *
 * The observatory read three publishers, all of them institutional or a trading
 * venue. That is the right base for a measurement and a poor one for a country:
 * a fuel decree, a strike, a shortage or a rate decision is reported before any
 * table records it, and an official series never says why a number moved.
 *
 * What is loaded here is coverage, not measurement, and the model keeps the two
 * apart on purpose. An article is the claim that an outlet published a headline
 * on a date — which is verifiable — never the claim that what it reports is so.
 * No figure quoted in an article reaches an indicator series: press domains
 * carry their own tier in the source registry precisely so they cannot.
 */
export const pressCoverageSchema = z.object({
  provenance: z
    .object({
      retrievedAt: z.iso.datetime({ offset: false }),
    })
    .strict(),
  articles: z
    .array(
      z
        .object({
          /** Registered masthead, established by the domain rather than the page. */
          outlet: z.string().trim().min(2).max(120),
          /** Domain the article was served from, which is what establishes the outlet. */
          domain: z
            .string()
            .trim()
            .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/u)
            .max(120),
          /** The outlet's own section, kept as it names it. */
          section: z.string().trim().min(2).max(80),
          headline: z.string().trim().min(12).max(300),
          /** The outlet's standfirst, where it publishes one. */
          summary: z.string().trim().max(1_200),
          url: z.url(),
          /** The stamp exactly as the feed wrote it, before any parsing. */
          statedDate: z.string().trim().min(4).max(80),
          publishedAt: z.iso.datetime({ offset: true }),
          eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
          /**
           * How the listing was obtained. Not every outlet publishes a feed:
           * one of these renders its sections in the browser, and a record that
           * took a browser to read is a weaker retrieval than one the publisher
           * syndicated for the purpose. The difference is recorded rather than
           * flattened.
           */
          retrievalMethod: z.enum(['SYNDICATED_FEED', 'RENDERED_SECTION']),
          /** The listing the article was read from. */
          listingUrl: z.url(),
          /** Digest of that listing, so the record can be checked against it. */
          listingSha256: z.string().regex(/^[a-f0-9]{64}$/u),
          /** The verbatim record the fields were read from. */
          excerpt: z.string().trim().min(20).max(3_500),
        })
        .strict(),
    )
    .min(1)
    .max(3_000),
});

export type PressCoverage = z.infer<typeof pressCoverageSchema>;
export type PressArticle = PressCoverage['articles'][number];
