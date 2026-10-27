import { z } from 'zod';

export const INQUIRY_PLAN_CODES = ['analista', 'profesional', 'institucional', 'a-medida'] as const;
export const INQUIRY_STATUSES = ['NEW', 'CONTACTED', 'WON', 'LOST'] as const;

/**
 * An optional free-text field that may arrive absent, null or blank.
 *
 * A form posts an empty input as `""`; storing that as an empty string would
 * make «no phone given» and «phone given» two different shapes of nothing, so
 * blank is folded into null after trimming.
 */
function optionalText(maximum: number) {
  return z
    .string()
    .trim()
    .max(maximum)
    .nullish()
    .transform((value) => (value ? value : null));
}

/**
 * What the public site's «contact our services» form submits.
 *
 * `requestId` is generated once per submission by the site and reused on every
 * retry of it, which is what lets the register answer a retry with the row it
 * already holds. Unknown fields are refused rather than dropped: a form that
 * starts sending something new should fail loudly here, not have it silently
 * vanish.
 */
export const inquirySubmissionSchema = z
  .object({
    requestId: z.uuid(),
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().max(200).pipe(z.email()),
    organization: optionalText(160),
    phone: optionalText(40),
    planCode: z.enum(INQUIRY_PLAN_CODES),
    message: z.string().trim().min(10).max(4000),
    sourceRoute: z.string().trim().min(1).max(200),
  })
  .strict();

const pageSize = z.coerce.number().int().min(1).max(100).default(25);

export const inquiryListQuerySchema = z.object({
  status: z.enum(INQUIRY_STATUSES).optional(),
  pageSize,
  cursor: z.string().min(1).max(512).optional(),
});

export const inquiryParamsSchema = z.object({ serviceInquiryId: z.uuid() }).strict();

/**
 * An operator's change of state.
 *
 * `operatorNote` keeps three meanings apart: absent leaves the stored note as it
 * is, null (or blank) clears it, and text replaces it. Folding absent into null
 * would make every status change silently erase the note written before it.
 */
export const inquiryUpdateSchema = z
  .object({
    status: z.enum(INQUIRY_STATUSES),
    operatorNote: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .transform((value) => (value ? value : null))
      .optional(),
  })
  .strict();

export type InquirySubmission = z.infer<typeof inquirySubmissionSchema>;
export type InquiryListQuery = z.infer<typeof inquiryListQuerySchema>;
export type InquiryUpdate = z.infer<typeof inquiryUpdateSchema>;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];
