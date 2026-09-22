import { z } from 'zod';

/**
 * What third parties published about how Bolivia buys and sells.
 *
 * The register once held platform analytics beside commerce — declared
 * audiences, monitored emotion, trending topics. ADR 0025 removed those: they
 * described platforms rather than markets, no legitimate collection route
 * existed for them, and a declared reach of 115% of the adult population is not
 * a measurement of anybody. What remains is the question the observatory exists
 * to answer, which ADR 0023 already framed: by what form of business does trade
 * actually happen here.
 *
 * So every record is the claim that a named compiler published a figure on a
 * date — which is checkable — and never a measurement the state made. Household
 * panels, chamber compilations and reported field studies enter here; the
 * state's own measured series enter through the indicator path, where the
 * publication check demands OFFICIAL.
 *
 * Nothing loaded here can reach an indicator series. See ADR 0022 and ADR 0025.
 */

/**
 * The channel a reading is about, or TRANSVERSAL when it spans all of them.
 *
 * Platforms stay named because commerce runs through them: a sale discovered on
 * Marketplace and settled in cash is a real form of trade, and losing the
 * channel would lose what ADR 0023 §1 exists to record. Naming the channel is
 * never naming a publisher — who compiled the figure is `publisher`.
 */
const platform = z.enum([
  'FACEBOOK',
  'INSTAGRAM',
  'TIKTOK',
  'YOUTUBE',
  'WHATSAPP',
  'MESSENGER',
  'LINKEDIN',
  'X',
  'REDDIT',
  'TRANSVERSAL',
]);

/**
 * What the reading is about.
 *
 * One value, and it is deliberately a closed set of one. AUDIENCE, TOPIC and
 * EMOTION were removed by ADR 0025, and leaving them loadable would let the
 * analytics return through the seed without anybody deciding to bring it back.
 * Widening this enum is the decision, and it should cost an ADR.
 */
const subject = z.enum(['COMMERCE']);

/**
 * How much weight the figure carries.
 *
 * HIGH is an identifiable source with a declared method and a reproducible
 * figure. MEDIUM is a serious source with a partial method, or a single study.
 * LOW is a commercial provider with no published method — indicative, not
 * citable. The grade travels with the figure so a reader can drop a band
 * without recompiling anything.
 */
const evidenceGrade = z.enum(['HIGH', 'MEDIUM', 'LOW']);

export const socialReadingsSchema = z.object({
  provenance: z
    .object({
      recordedAt: z.iso.datetime({ offset: false }),
    })
    .strict(),
  readings: z
    .array(
      z
        .object({
          platform,
          subject,
          /** Stable code for the quantity, so two compilers of the same thing meet. */
          metric: z
            .string()
            .trim()
            .regex(/^[A-Z][A-Z0-9_]{3,59}$/u),
          /** How the reading reads in Spanish, as the register will show it. */
          label: z.string().trim().min(8).max(220),
          /** The figure exactly as published, unrounded and unconverted. */
          value: z.string().regex(/^-?\d+(\.\d{1,6})?$/u),
          unit: z.enum(['PERSONS', 'ACCOUNTS', 'PERCENT', 'COUNT', 'PER_MINUTE', 'BOB', 'USD']),
          /** The period the figure describes: YYYY, YYYY-MM or YYYY-MM-DD. */
          referencePeriod: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/u),
          /** First day of that period, so the register can be ordered by time. */
          eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
          /** The day the compiler published it, or the first of the period it dates. */
          publishedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
          /**
           * How precisely the compiler dates its own publication.
           *
           * Industry reports routinely date themselves to a month and academic
           * work to a year. Writing a day where the source states a month would
           * attribute a stamp nobody published, so the precision is recorded
           * and `publishedOn` carries the first day of whatever unit it names.
           */
          publicationPrecision: z.enum(['DAY', 'MONTH', 'YEAR']),
          /** Registered compiler, established by its domain. */
          publisher: z.string().trim().min(3).max(120),
          publisherDomain: z
            .string()
            .trim()
            .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/u)
            .max(120),
          /** Title of the publication the figure was read from. */
          publication: z.string().trim().min(6).max(240),
          url: z.url(),
          /** What the compiler says it did, in its own terms. Empty when it says nothing. */
          method: z.string().trim().max(400),
          evidenceGrade,
          /**
           * The reading as this observatory recorded it.
           *
           * Not a byte-exact capture: the publication was read, not downloaded
           * and digested, and calling this an excerpt would claim a retrieval
           * that did not happen. See ADR 0022 §4.
           */
          statement: z.string().trim().min(20).max(1_200),
        })
        .strict(),
    )
    .min(1)
    .max(2_000),
});

export type SocialReadings = z.infer<typeof socialReadingsSchema>;
export type SocialReading = SocialReadings['readings'][number];
