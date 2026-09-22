import { z } from 'zod';
import { date } from './seed.primitives';

/**
 * The yield curve the Bolsa Boliviana de Valores closes each session with.
 *
 * A yield is not a series point the way an exchange rate is. It only means
 * something together with what was issued, by whom, in which currency, on which
 * side of the market and for how long — five things, where a quotation has one.
 * That is why these are kept apart from the measured indicators instead of
 * being flattened into them: collapsing tenors into a daily median would
 * produce a number no one quoted.
 *
 * The exchange serves the closing session and no archive, so this file
 * accumulates one session at a time and its history begins where the collector
 * did. Stated rather than disguised, like the central bank's quotations.
 */
export const bbvYieldsSchema = z.object({
  yields: z
    .array(
      z
        .object({
          eventDate: date,
          /** Currency the rate is quoted in, as the exchange tabs it. */
          currency: z.enum(['BOB', 'USD', 'UFV']),
          operation: z.enum(['COMPRAVENTA', 'REPORTO']),
          /** Whether the exchange files the paper as serialised or not. */
          segment: z.string().trim().min(3).max(60),
          /** Instrument code as published: BTS, BLP, CUP, LRS, DPF, PGB, BBB. */
          instrument: z
            .string()
            .regex(/^[A-Z]{2,6}$/u)
            .max(6),
          /** Issuer code, empty on the exchange's own aggregate rows. */
          issuer: z
            .string()
            .regex(/^[A-Z]{0,6}$/u)
            .max(6),
          /** Maturity band in days, exactly as the column is headed. */
          tenorBucket: z.string().trim().min(1).max(20),
          /** Annual rate in per cent, without its sign. */
          value: z.string().regex(/^\d+(?:\.\d+)?$/u),
          /** The figure exactly as the exchange prints it, per cent sign included. */
          statedValue: z.string().trim().min(2).max(20),
          excerpt: z.string().trim().min(10).max(300),
          sourceUrl: z.url(),
          documentSha256: z.string().regex(/^[a-f0-9]{64}$/u),
          retrievedAt: z.iso.datetime({ offset: false }),
        })
        .strict(),
    )
    .min(1)
    .max(20_000),
});

export type BbvYields = z.infer<typeof bbvYieldsSchema>;
export type BbvYield = BbvYields['yields'][number];
