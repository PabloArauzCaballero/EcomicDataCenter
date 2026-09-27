import { z } from 'zod';

/**
 * What a source promises, declared rather than inferred.
 *
 * Without this, «atrasada» has to be guessed from the age of the newest datum,
 * and that guess is wrong in both directions: an annual series looks eleven
 * months late every February, and a daily source that stopped answering last
 * week looks fine as long as its last figure is still the newest one there is.
 *
 * The source is named by its code and not by its identifier, so the calendar of
 * a source this deployment does not carry is skipped rather than failing the
 * load — a catalogue of promises is not a list of dependencies.
 */
export const sourceScheduleSeedSchema = z.array(
  z
    .object({
      sourceExpectationId: z.string().uuid(),
      sourceCode: z.string().min(1).max(80),
      cadence: z.enum(['CONTINUOUS', 'PERIODIC', 'HISTORICAL']),
      expectedIntervalHours: z.number().int().min(1).max(87_600).nullable(),
      toleranceHours: z.number().int().min(0).max(8_760),
      timeZone: z.string().min(1).max(60),
      isActive: z.boolean(),
      /** Why this calendar, in one sentence, for whoever reads the register. */
      note: z.string().min(10).max(400),
    })
    .strict()
    .refine(
      (entry) => (entry.cadence === 'HISTORICAL') === (entry.expectedIntervalHours === null),
      'Una fuente histórica no declara intervalo; cualquier otra sí',
    ),
);

export type SourceScheduleSeed = z.infer<typeof sourceScheduleSeedSchema>;
