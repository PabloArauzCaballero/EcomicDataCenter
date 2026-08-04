import type { ZodError } from 'zod';

/** Field-level reason a request was rejected, safe to return to the caller. */
export interface SafeValidationIssue {
  readonly code: string;
  readonly path: readonly string[];
  readonly message: string;
}

/**
 * Projects Zod issues onto the three fields the error contract exposes.
 *
 * Several issue kinds carry the offending value (`received`, `keys`), so the
 * whole issue is never forwarded: a rejected payload must not be echoed back
 * into a response that may be logged or shown by an intermediary.
 */
export function toSafeValidationIssues(error: ZodError): readonly SafeValidationIssue[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.map(String),
    message: issue.message,
  }));
}
