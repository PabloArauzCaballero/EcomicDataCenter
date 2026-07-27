import { z } from 'zod';
import { BusinessRuleError } from '../../common/errors/application.error';

/**
 * Keyset position of the last row a client received.
 *
 * Deep `OFFSET` makes PostgreSQL walk and discard every skipped row, so cost
 * grows with page number. A cursor turns that into an index range scan whose
 * cost is constant regardless of how far the client has read.
 */
export interface QueryCursor {
  readonly periodStart: string;
  readonly seriesKey: string;
}

const cursorSchema = z
  .object({
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    seriesKey: z.string().min(1).max(2000),
  })
  .strict();

/** Encodes a position as an opaque token so clients cannot craft SQL from it. */
export function encodeCursor(cursor: QueryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/**
 * Decodes and validates a client-supplied token.
 *
 * The token is untrusted input, so it is parsed with the same strictness
 * applied to a request body. A malformed value is a client error rather than a
 * silent fallback to the first page.
 */
export function decodeCursor(token: string): QueryCursor {
  let candidate: unknown;
  try {
    candidate = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw new BusinessRuleError('The pagination cursor is malformed');
  }
  const parsed = cursorSchema.safeParse(candidate);
  if (!parsed.success) throw new BusinessRuleError('The pagination cursor is malformed');
  return parsed.data;
}
