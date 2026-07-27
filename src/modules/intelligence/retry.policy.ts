/**
 * Bounds how often a failed agent item may be reprocessed.
 *
 * A poisoned payload that fails deterministically must stop consuming capacity
 * and become visible to an operator instead of retrying forever. The database
 * enforces the same ceiling through `ck_raw_observation_retry_count`.
 */

export const MAX_RETRY_ATTEMPTS = 5;

const BASE_DELAY_SECONDS = 30;
const MAX_DELAY_SECONDS = 3600;

export type RetryDecision =
  | { readonly action: 'RETRY'; readonly attempt: number; readonly delaySeconds: number }
  | { readonly action: 'DEAD_LETTER'; readonly attempt: number; readonly reason: string };

/**
 * Decides whether an item may be retried again.
 *
 * The delay grows exponentially and is capped, so a source that is temporarily
 * unavailable is not hammered while a genuinely broken item still reaches the
 * dead-letter state within a bounded number of attempts.
 */
export function decideRetry(currentRetryCount: number): RetryDecision {
  const attempt = currentRetryCount + 1;
  if (attempt > MAX_RETRY_ATTEMPTS) {
    return {
      action: 'DEAD_LETTER',
      attempt,
      reason: `Exhausted ${MAX_RETRY_ATTEMPTS} reprocessing attempts`,
    };
  }
  return { action: 'RETRY', attempt, delaySeconds: backoffSeconds(attempt) };
}

/** Exponential backoff in seconds for a given attempt number, starting at one. */
export function backoffSeconds(attempt: number): number {
  const delay = BASE_DELAY_SECONDS * 2 ** Math.max(0, attempt - 1);
  return Math.min(delay, MAX_DELAY_SECONDS);
}

/** True when an item is in a state an operator may ask to reprocess. */
export function isRetryable(processingStatus: string): boolean {
  return processingStatus === 'REJECTED' || processingStatus === 'QUARANTINED';
}
