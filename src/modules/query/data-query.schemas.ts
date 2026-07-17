import { z } from 'zod';
import { dimensionValueSchema } from '../../common/statistical/dimension-value.schema';

const MAX_OFFSET_PAGE = 10_000;

export const dataQuerySchema = z
  .object({
    datasetVersionId: z.string().uuid(),
    indicatorVersionId: z.string().uuid().optional(),
    periodFrom: z.iso.date().optional(),
    periodTo: z.iso.date().optional(),
    vintageDate: z.iso.date().optional(),
    dimensions: z.array(dimensionValueSchema).max(20).default([]),
    page: z.number().int().min(1).max(MAX_OFFSET_PAGE).default(1),
    pageSize: z.number().int().min(1).max(200).default(50),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.periodFrom && value.periodTo && value.periodTo < value.periodFrom) {
      context.addIssue({
        code: 'custom',
        path: ['periodTo'],
        message: 'periodTo precedes periodFrom',
      });
    }
  });

export const traceParamsSchema = z.object({
  observationId: z.string().regex(/^\d+$/),
  revisionId: z.string().regex(/^\d+$/),
});

export type DataQueryInput = z.infer<typeof dataQuerySchema>;
export type TraceParams = z.infer<typeof traceParamsSchema>;
