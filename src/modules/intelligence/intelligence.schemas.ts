import { z } from 'zod';
import { isSafeSourceUrl } from './untrusted-content';

const uuid = z.string().uuid();
const code = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[A-Z0-9][A-Z0-9_-]*$/u, 'Codes use upper case letters, digits, hyphen and underscore');

export const AGENT_TYPES = [
  'EXCHANGE_RATE',
  'SOVEREIGN_DEBT',
  'SECTOR',
  'SOCIOECONOMIC',
  'SENTIMENT',
  'UNCERTAINTY',
  'CORPORATE',
  'POLITICAL',
  'SECURITIES_MARKET',
  'FINANCIAL_SYSTEM',
  'EXTERNAL_SECTOR',
] as const;

export const CLAIM_TYPES = [
  'FACT',
  'INDICATOR_READING',
  'ESTIMATE',
  'OPINION',
  'FORECAST',
  'AI_INFERENCE',
  'RISK',
  'OPPORTUNITY',
  'THREAT',
  'TREND',
  'RECOMMENDATION',
] as const;

const CONFIDENCE_LEVELS = ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'] as const;
const IMPACT_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NEGLIGIBLE'] as const;
const TIME_HORIZONS = [
  'IMMEDIATE',
  'SHORT_TERM',
  'MEDIUM_TERM',
  'LONG_TERM',
  'STRUCTURAL',
] as const;

export const registerAgentSchema = z
  .object({
    code,
    name: z.string().min(3).max(250),
    agentType: z.enum(AGENT_TYPES),
    provider: z.string().min(1).max(80),
    modelIdentifier: z.string().min(1).max(120),
    specialty: z.string().min(1).max(120).optional(),
    promptVersion: z.string().min(1).max(40),
    schemaVersion: z.string().min(1).max(40),
    organizationId: uuid,
    configuration: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const openAgentRunSchema = z
  .object({
    agentCode: code,
    triggerType: z.enum(['SCHEDULED', 'MANUAL', 'RETRY', 'BACKFILL']),
    attemptNo: z.number().int().min(1).max(50).default(1),
    promptVersion: z.string().min(1).max(40),
    schemaVersion: z.string().min(1).max(40),
  })
  .strict();

const evidenceSchema = z
  .object({
    sourceArtifactId: uuid,
    excerpt: z.string().min(20).max(4000),
    locator: z
      .string()
      .max(2000)
      .refine(isSafeSourceUrl, 'The locator must be a public http or https URL')
      .optional(),
    retrievedAt: z.coerce.date(),
  })
  .strict();

const claimSchema = z
  .object({
    claimType: z.enum(CLAIM_TYPES),
    assertion: z.string().min(20).max(4000),
    eventDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .optional(),
    publishedAt: z.coerce.date().optional(),
    timeHorizon: z.enum(TIME_HORIZONS).optional(),
    impactLevel: z.enum(IMPACT_LEVELS).optional(),
    probability: z.number().min(0).max(1).optional(),
    confidenceLevel: z.enum(CONFIDENCE_LEVELS),
    confidenceScore: z.number().min(0).max(1).optional(),
    statisticalDomainId: uuid.optional(),
    geographicUnitId: uuid.optional(),
    entityMentions: z.array(z.string().min(2).max(250)).max(25).default([]),
    evidence: z.array(evidenceSchema).min(1).max(10),
  })
  .strict();

export const submitObservationsSchema = z
  .object({
    submissionCode: code,
    items: z
      .array(
        z
          .object({
            rawPayload: z.record(z.string(), z.unknown()),
            claim: claimSchema,
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

export const completeAgentRunSchema = z
  .object({
    status: z.enum(['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED']),
    sourcesConsulted: z.number().int().min(0).max(100_000).default(0),
    warningCount: z.number().int().min(0).max(100_000).default(0),
    estimatedCostUsd: z.number().min(0).max(1_000_000).optional(),
    errorSummary: z.string().max(2000).optional(),
    checkpoint: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/**
 * A whole daily collection cycle in one request.
 *
 * It composes the existing open, submit and complete contracts unchanged so an
 * agent like codex can open its run, deliver the day's claims and close the run
 * without three round trips. Quantitative readings travel as reviewed claims,
 * never as authoritative observations, so the untrusted-agent boundary holds.
 */
export const submitDailyAnalysisSchema = z
  .object({
    agent: openAgentRunSchema,
    submission: submitObservationsSchema,
    completion: completeAgentRunSchema,
  })
  .strict();

export const reviewDecisionSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED', 'ESCALATED']),
    rationale: z.string().min(10).max(2000),
  })
  .strict();

export const resolveContradictionSchema = z
  .object({
    resolution: z.enum(['RESOLVED', 'ACCEPTED_DIVERGENCE', 'DISMISSED']),
    rationale: z.string().min(10).max(2000),
    selectedReference: z.string().max(80).optional(),
  })
  .strict();

export const claimQuerySchema = z
  .object({
    claimType: z.enum(CLAIM_TYPES).optional(),
    statisticalDomainId: uuid.optional(),
    geographicUnitId: uuid.optional(),
    economicEntityId: uuid.optional(),
    status: z.enum(['PUBLISHED', 'PENDING_REVIEW', 'REJECTED', 'SUPERSEDED']).default('PUBLISHED'),
    page: z.number().int().min(1).max(10_000).default(1),
    pageSize: z.number().int().min(1).max(200).default(50),
  })
  .strict();

export const deadLetterQuerySchema = z.object({ agentRunId: uuid.optional() }).strict();

export const sweepAbandonedSchema = z
  .object({ olderThanMinutes: z.number().int().min(5).max(10_080).default(60) })
  .strict();

export const identifierParamsSchema = z.object({ id: uuid }).strict();

/** Raw observation identifiers are bigint surrogate keys, not UUIDs. */
export const numericIdParamsSchema = z.object({ id: z.string().regex(/^\d{1,19}$/u) }).strict();

export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;
export type OpenAgentRunInput = z.infer<typeof openAgentRunSchema>;
export type SubmitObservationsInput = z.infer<typeof submitObservationsSchema>;
export type SubmissionItemInput = SubmitObservationsInput['items'][number];
export type CompleteAgentRunInput = z.infer<typeof completeAgentRunSchema>;
export type SubmitDailyAnalysisInput = z.infer<typeof submitDailyAnalysisSchema>;
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;
export type ResolveContradictionInput = z.infer<typeof resolveContradictionSchema>;
export type ClaimQueryInput = z.infer<typeof claimQuerySchema>;
export type IdentifierParams = z.infer<typeof identifierParamsSchema>;
export type NumericIdParams = z.infer<typeof numericIdParamsSchema>;
export type DeadLetterQueryInput = z.infer<typeof deadLetterQuerySchema>;
export type SweepAbandonedInput = z.infer<typeof sweepAbandonedSchema>;
