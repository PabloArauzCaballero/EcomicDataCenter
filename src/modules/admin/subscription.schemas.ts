import { z } from 'zod';
import { PASSWORD_MINIMUM_LENGTH } from './subscription-secrets';

export const PLAN_CODES = ['analista', 'profesional', 'institucional'] as const;
export const BILLING_PERIODS = ['MONTHLY', 'ANNUAL'] as const;
export const ACCOUNT_STATUSES = ['PENDING', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'] as const;
export const USAGE_KINDS = ['API', 'DOWNLOAD', 'CHAT', 'MAP'] as const;
export const TOKEN_PURPOSES = ['ACTIVATE', 'RESET'] as const;

export type PlanCode = (typeof PLAN_CODES)[number];
export type BillingPeriod = (typeof BILLING_PERIODS)[number];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export type UsageKind = (typeof USAGE_KINDS)[number];
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number];

/** E-mail compared and stored lowercased, so one person cannot hold two accounts. */
const email = z
  .string()
  .trim()
  .max(200)
  .pipe(z.email())
  .transform((value) => value.toLowerCase());

/** The bound on length keeps scrypt's input small; no other rule is imposed. */
const newPassword = z.string().min(PASSWORD_MINIMUM_LENGTH).max(200);
/** A password being checked is never measured against the policy: it either matches or not. */
const givenPassword = z.string().min(1).max(200);

/** An optional free-text field: blank is folded into null after trimming. */
function optionalText(maximum: number) {
  return z
    .string()
    .trim()
    .max(maximum)
    .nullish()
    .transform((value) => (value ? value : null));
}

/** Absent leaves the stored value, null or blank clears it, text replaces it. */
function patchText(maximum: number) {
  return z
    .string()
    .trim()
    .max(maximum)
    .nullable()
    .transform((value) => (value ? value : null))
    .optional();
}

export const accountParamsSchema = z.object({ subscriberAccountId: z.uuid() }).strict();
export const apiKeyParamsSchema = z
  .object({ subscriberAccountId: z.uuid(), apiKeyId: z.uuid() })
  .strict();

export const sessionSchema = z.object({ email, password: givenPassword }).strict();

export const apiKeyCreationSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    maxActiveKeys: z.number().int().min(1).max(100).default(1),
  })
  .strict();

export const passwordChangeSchema = z
  .object({ currentPassword: givenPassword, newPassword })
  .strict();

export const activationSchema = z
  .object({
    token: z.string().min(16).max(200),
    password: newPassword,
    termsVersion: z.string().trim().min(1).max(40),
  })
  .strict();

export const usageIncrementSchema = z
  .object({
    subscriberAccountId: z.uuid(),
    usageKind: z.enum(USAGE_KINDS),
    amount: z.number().int().min(1).max(100000),
  })
  .strict();

export const apiKeyVerificationSchema = z
  .object({
    keyHash: z.string().regex(/^[0-9a-f]{64}$/u),
    usageKind: z.literal('API').default('API'),
    amount: z.literal(1).default(1),
  })
  .strict();

const pageSize = z.coerce.number().int().min(1).max(100).default(25);

export const accountListQuerySchema = z
  .object({
    status: z.enum(ACCOUNT_STATUSES).optional(),
    pageSize,
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();

export const accountCreationSchema = z
  .object({
    email,
    fullName: z.string().trim().min(2).max(120),
    organization: optionalText(160),
    planCode: z.enum(PLAN_CODES),
    billingPeriod: z.enum(BILLING_PERIODS),
    trialDays: z.number().int().min(0).max(30).default(0),
    serviceInquiryId: z
      .uuid()
      .nullish()
      .transform((value) => value ?? null),
  })
  .strict();

export const accountUpdateSchema = z
  .object({
    planCode: z.enum(PLAN_CODES).optional(),
    billingPeriod: z.enum(BILLING_PERIODS).optional(),
    status: z.enum(ACCOUNT_STATUSES).optional(),
    legalName: patchText(200),
    taxId: patchText(40),
    organization: patchText(160),
  })
  .strict();

export const paymentSchema = z
  .object({
    amountBob: z
      .number()
      .positive()
      .max(9999999999.99)
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
        message: 'At most two decimals',
      }),
    coversUntil: z.iso.date(),
    reference: optionalText(200),
  })
  .strict();

export const tokenRequestSchema = z.object({ purpose: z.enum(TOKEN_PURPOSES) }).strict();

export type Session = z.infer<typeof sessionSchema>;
export type ApiKeyCreation = z.infer<typeof apiKeyCreationSchema>;
export type PasswordChange = z.infer<typeof passwordChangeSchema>;
export type Activation = z.infer<typeof activationSchema>;
export type UsageIncrement = z.infer<typeof usageIncrementSchema>;
export type ApiKeyVerification = z.infer<typeof apiKeyVerificationSchema>;
export type AccountListQuery = z.infer<typeof accountListQuerySchema>;
export type AccountCreation = z.infer<typeof accountCreationSchema>;
export type AccountUpdate = z.infer<typeof accountUpdateSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type TokenRequest = z.infer<typeof tokenRequestSchema>;
