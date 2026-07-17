import { z } from 'zod';

const identifier = z.union([z.string().uuid(), z.string().regex(/^\d+$/)]);

export const registrationResultSchema = z
  .object({
    status: z.enum(['PUBLISHED', 'REJECTED', 'UNCHANGED']),
    batchId: z.string().uuid(),
    seriesId: z.string().uuid(),
    observationId: identifier,
    observationRevisionId: identifier.optional(),
    revisionNumber: z.number().int().positive().optional(),
    qualityIssueIds: z.array(z.string().uuid()),
  })
  .strict();

export type RegistrationResult = z.infer<typeof registrationResultSchema>;

export const batchRecordResultSchema = z
  .object({
    index: z.number().int().nonnegative(),
    status: z.enum(['PUBLISHED', 'REJECTED', 'UNCHANGED', 'INVALID']),
    observationId: identifier.optional(),
    revisionId: identifier.optional(),
    error: z.object({ code: z.string(), message: z.string() }).strict().optional(),
  })
  .strict();

export const batchImportResultSchema = z
  .object({
    batchId: z.string().uuid(),
    status: z.enum(['COMMITTED', 'PARTIAL', 'REJECTED']),
    receivedCount: z.number().int().positive(),
    acceptedCount: z.number().int().nonnegative(),
    rejectedCount: z.number().int().nonnegative(),
    records: z.array(batchRecordResultSchema),
  })
  .strict();

export type BatchImportResult = z.infer<typeof batchImportResultSchema>;
export type BatchRecordResult = z.infer<typeof batchRecordResultSchema>;
