import { z } from 'zod';

/**
 * Annual macroeconomic series captured from a multilateral compiler.
 *
 * One retrieval per indicator, each with its own citable URL and digest, so a
 * reader can re-request exactly the series a figure came from rather than a
 * bundle it was part of.
 */

const measuredValue = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/iu, 'a measured value must be numeric');

export const macroAnnualHistorySchema = z.object({
  series: z
    .array(
      z
        .object({
          indicatorCode: z
            .string()
            .regex(/^[A-Z][A-Z0-9_]*$/u)
            .max(60),
          /** Identifier at the compiler, so the figure can be looked up there. */
          worldBankCode: z.string().min(3).max(40),
          name: z.string().trim().min(3).max(200),
          /**
           * Unit the compiler publishes the figure in.
           *
           * Kept as a closed list so a new one is a deliberate addition rather
           * than a string that silently reaches a chart axis unformatted.
           */
          unit: z.enum(['PERCENT', 'PERCENT_OF_GDP', 'USD', 'INDEX', 'MONTHS', 'PEOPLE', 'YEARS']),
          provenance: z
            .object({
              publisher: z.string().trim().min(2).max(200),
              sourceUrl: z.url(),
              retrievedAt: z.iso.datetime({ offset: false }),
              upstreamSha256: z.string().regex(/^[a-f0-9]{64}$/u),
              frequency: z.literal('ANNUAL'),
            })
            .strict(),
          points: z
            .array(
              z
                .object({
                  /** Calendar year the figure describes. */
                  period: z.string().regex(/^(19|20)\d{2}$/u),
                  value: measuredValue,
                  /** Literal fragment of the payload the value was read from. */
                  excerpt: z.string().min(10).max(4_000),
                })
                .strict(),
            )
            .min(1)
            .max(200),
        })
        .strict(),
    )
    .min(1)
    .max(60),
});

export type MacroAnnualHistory = z.infer<typeof macroAnnualHistorySchema>;
export type MacroAnnualSeries = MacroAnnualHistory['series'][number];
