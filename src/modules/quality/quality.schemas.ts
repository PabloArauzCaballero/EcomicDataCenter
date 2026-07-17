import { z } from 'zod';

const uuid = z.string().uuid();
const date = z.iso.date();

export const createQualityDimensionSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(180),
  description: z.string().max(5_000).optional(),
});

const qualityConfigSchema = z.union([
  z.object({ measureDefinitionId: uuid }).strict(),
  z.object({ measureDefinitionId: uuid, minimum: z.string().optional(), maximum: z.string().optional() }).strict(),
]);

export const createQualityRuleSchema = z.object({
  qualityDimensionId: uuid,
  code: z.string().min(1).max(80),
  name: z.string().min(2).max(250),
  ruleType: z.enum(['REQUIRED_MEASURE', 'NON_NEGATIVE', 'NUMERIC_RANGE']),
  severity: z.enum(['INFO', 'WARNING', 'ERROR', 'CRITICAL']),
  targetEntityType: z.literal('OBSERVATION_REVISION'),
  configurationJson: qualityConfigSchema,
  isActive: z.boolean().default(true),
});

export const createLineageRelationSchema = z.object({
  methodologyVersionId: uuid.optional(),
  sourceEntityType: z.string().min(2).max(40),
  sourceEntityId: z.string().min(1).max(80),
  targetEntityType: z.string().min(2).max(40),
  targetEntityId: z.string().min(1).max(80),
  relationType: z.string().min(2).max(40),
  transformationDescription: z.string().max(20_000).optional(),
  formula: z.string().max(20_000).optional(),
});

export const createIndicatorRelationSchema = z.object({
  sourceIndicatorVersionId: uuid,
  targetIndicatorVersionId: uuid,
  relationType: z.string().min(2).max(40),
  formula: z.string().max(20_000).optional(),
  description: z.string().max(20_000).optional(),
  validFrom: date.optional(),
  validTo: date.optional(),
});

export const createSeriesBreakSchema = z.object({
  seriesId: uuid,
  methodologyVersionId: uuid.optional(),
  breakDate: date,
  breakType: z.string().min(2).max(40),
  reason: z.string().min(2).max(20_000),
  isComparableBeforeAfter: z.boolean(),
  linkingMethod: z.string().max(20_000).optional(),
  notes: z.string().max(20_000).optional(),
});

export const issueTransitionSchema = z.object({
  targetStatus: z.enum(['TRIAGED', 'IN_CORRECTION', 'RESOLVED', 'VERIFIED', 'CLOSED', 'REOPENED', 'DISMISSED']),
  resolutionNotes: z.string().max(20_000).optional(),
});

export const issueListSchema = z.object({
  status: z.string().max(30).optional(),
  severity: z.string().max(20).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const issueParamsSchema = z.object({ id: uuid });

export type CreateQualityDimensionInput = z.infer<typeof createQualityDimensionSchema>;
export type CreateQualityRuleInput = z.infer<typeof createQualityRuleSchema>;
export type CreateLineageRelationInput = z.infer<typeof createLineageRelationSchema>;
export type CreateIndicatorRelationInput = z.infer<typeof createIndicatorRelationSchema>;
export type CreateSeriesBreakInput = z.infer<typeof createSeriesBreakSchema>;
export type IssueTransitionInput = z.infer<typeof issueTransitionSchema>;
export type IssueListInput = z.infer<typeof issueListSchema>;
