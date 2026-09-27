import { z } from 'zod';

/**
 * A half-open interval: the start is included and the end is not.
 *
 * Stating it once, here, is what keeps two panels that both say «septiembre»
 * from disagreeing by one day at the boundary — the rule that a row dated
 * exactly at `until` belongs to the next window, not this one.
 */
const instant = z.iso.datetime({ offset: true });

export const windowSchema = z.object({
  /** Inclusive lower bound. */
  since: instant.optional(),
  /** Exclusive upper bound. */
  until: instant.optional(),
});

const pageSize = z.coerce.number().int().min(1).max(200).default(50);
const cursor = z.string().min(1).max(512).optional();

export const listQuerySchema = windowSchema.extend({ pageSize, cursor });

export const ingestionRunQuerySchema = listQuerySchema.extend({
  sourceCode: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,80}$/u)
    .optional(),
  status: z.enum(['RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED']).optional(),
  stage: z
    .enum(['COLLECTION', 'VALIDATION', 'DELIVERY', 'PERSISTENCE', 'REVIEW', 'PUBLICATION'])
    .optional(),
});

export const auditQuerySchema = listQuerySchema.extend({
  entityType: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,60}$/u)
    .optional(),
  outcome: z.enum(['SUCCESS', 'FAILURE']).optional(),
  actorSubject: z.string().min(1).max(200).optional(),
});

export const qualityEvaluationQuerySchema = listQuerySchema.extend({
  ruleCode: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,80}$/u)
    .optional(),
  result: z
    .enum(['PASS', 'WARNING', 'FAIL', 'ERROR', 'NOT_EVALUATED', 'NOT_APPLICABLE'])
    .optional(),
  severity: z.enum(['INFO', 'WARNING', 'ERROR', 'CRITICAL']).optional(),
});

export const exportQuerySchema = listQuerySchema.extend({
  datasetCode: z
    .string()
    .regex(/^[a-z]{1,40}$/u)
    .optional(),
  status: z.enum(['REQUESTED', 'GENERATED', 'FAILED']).optional(),
});

export const trafficQuerySchema = windowSchema.extend({
  granularity: z.enum(['hour', 'day']).default('day'),
});

/**
 * The catalogues the metadata screen may ask for, by name.
 *
 * It is an allowlist and not a table name because the alternative — accepting
 * an identifier and interpolating it — is a SQL injection with extra steps, and
 * because a catalogue that is not on this list has not been checked for whether
 * it is safe to show in full.
 */
export const METADATA_CATALOGS = [
  'frequencies',
  'units',
  'geographic-units',
  'statistical-domains',
  'quality-dimensions',
  'organizations',
  'sources',
  'datasets',
  'indicators',
  'methodologies',
] as const;

export type MetadataCatalog = (typeof METADATA_CATALOGS)[number];

export const metadataParamsSchema = z.object({ catalog: z.enum(METADATA_CATALOGS) });

export const seedRunParamsSchema = z.object({ seedRunId: z.string().uuid() });

export const seedRequestSchema = z.object({
  packageCode: z
    .string()
    .regex(/^[a-z][a-z0-9-]{1,79}$/u)
    .describe('A package code the manifest declares; never a file path'),
  /** The version the operator believes they are applying. */
  expectedVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
  /**
   * The checksum the operator saw when they read the difference.
   *
   * Requiring it is what makes «apply what I just reviewed» different from
   * «apply whatever is there now»: if the package changed between the two
   * requests, the second one is refused instead of applying something nobody
   * looked at.
   */
  expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/u),
  reason: z.string().min(4).max(500),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
export type IngestionRunQuery = z.infer<typeof ingestionRunQuerySchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type QualityEvaluationQuery = z.infer<typeof qualityEvaluationQuerySchema>;
export type ExportQuery = z.infer<typeof exportQuerySchema>;
export type TrafficQuery = z.infer<typeof trafficQuerySchema>;
export type SeedRequest = z.infer<typeof seedRequestSchema>;
