import { z } from 'zod';

/**
 * A normalised route, with no query string and no free text.
 *
 * The site normalises before it sends and this refuses anything that arrives
 * un-normalised anyway. Two reasons, and the second is the one that matters: an
 * identifier left in a path explodes the cardinality of every aggregate, and a
 * search term left in a query string is a reader's words arriving in a register
 * that was never meant to hold them.
 */
const route = z
  .string()
  .regex(/^\/[A-Za-z0-9\-_/{}]{0,120}$/u)
  .refine((value) => !value.includes('?'), 'A normalised route carries no query string');

const trafficEventSchema = z
  .object({
    /** Client-generated, used only to drop a repeated delivery of one event. */
    eventId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/u),
    occurredAt: z.iso.datetime({ offset: true }),
    route,
    kind: z.enum(['PAGE_VIEW', 'DOWNLOAD_INTENT']),
    device: z.enum(['DESKTOP', 'MOBILE', 'TABLET', 'UNKNOWN']),
    referrer: z.enum(['DIRECT', 'SEARCH', 'SOCIAL', 'EXTERNAL', 'INTERNAL']),
    /**
     * A short, rotating bucket that lets sessions be estimated and people not
     * be identified. It is not an address and not a stable identifier.
     */
    visitorBucket: z.string().regex(/^[a-f0-9]{16}$/u),
    isRobot: z.boolean(),
  })
  .strict();

export const trafficBatchSchema = z
  .object({ events: z.array(trafficEventSchema).min(1).max(50) })
  .strict();

/**
 * One stage of one export, reported by the server that ran it.
 *
 * `REQUESTED` and `GENERATED` are separate rows with the same request id, so
 * an export that was asked for and never produced is visible as exactly that.
 * There is no `TRANSFER_COMPLETED`: nothing in this deployment can observe the
 * last byte reaching the reader, and a status nobody measures would be worse
 * than an absent one.
 */
export const exportEventSchema = z
  .object({
    requestId: z.string().regex(/^[A-Za-z0-9._:-]{8,64}$/u),
    datasetCode: z.string().regex(/^[a-z]{1,40}$/u),
    format: z.enum(['csv', 'json']),
    status: z.enum(['REQUESTED', 'GENERATED', 'FAILED']),
    /** Only the filters the export contract declares; never free-text search. */
    filters: z.record(z.string().max(40), z.string().max(120)).default({}),
    rowCount: z.number().int().min(0).max(100_000_000).optional(),
    byteCount: z.number().int().min(0).max(10_000_000_000).optional(),
    durationMs: z.number().int().min(0).max(3_600_000).optional(),
    truncated: z.boolean().default(false),
    errorCode: z
      .string()
      .regex(/^[A-Z_]{1,60}$/u)
      .optional(),
  })
  .strict();

export type TrafficBatch = z.infer<typeof trafficBatchSchema>;
export type ExportEvent = z.infer<typeof exportEventSchema>;
