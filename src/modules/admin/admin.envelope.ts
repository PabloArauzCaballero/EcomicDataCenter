/**
 * How sure the register is about what it just said.
 *
 * `known` means the figure was measured and the measurement is current.
 * `unknown` means the measurement is missing — no telemetry arrived, no
 * calendar was declared — and it must never be rendered as a zero. `stale`
 * means a figure exists but its observation is older than the window it claims
 * to describe. `not_applicable` means the question does not apply to this
 * subject at all, which is a different answer from «we could not tell».
 */
export type EvidenceState = 'known' | 'unknown' | 'stale' | 'not_applicable';

export interface AdminMeta {
  /** The deployment this answer describes, resolved on the server. */
  readonly environmentId: string;
  /** When the underlying evidence was observed; null when nothing was. */
  readonly observedAt: string | null;
  /** When this response was computed. */
  readonly generatedAt: string;
  readonly evidenceState: EvidenceState;
  readonly requestId: string;
}

export interface AdminEnvelope<T> {
  readonly data: T;
  readonly meta: AdminMeta;
}

/** One page of a server-paginated listing. `nextCursor` is null at the end. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface EnvelopeContext {
  readonly environmentId: string;
  readonly requestId: string;
  readonly observedAt?: Date | string | null;
  readonly evidenceState?: EvidenceState;
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Wraps a payload with the provenance of the answer itself.
 *
 * The evidence state defaults to `unknown` rather than `known` on purpose: a
 * caller that forgets to say how sure it is produces a response that admits
 * ignorance instead of one that quietly asserts confidence it never earned.
 */
export function envelope<T>(data: T, context: EnvelopeContext): AdminEnvelope<T> {
  return {
    data,
    meta: {
      environmentId: context.environmentId,
      observedAt: toIsoOrNull(context.observedAt),
      generatedAt: new Date().toISOString(),
      evidenceState: context.evidenceState ?? 'unknown',
      requestId: context.requestId,
    },
  };
}

/**
 * The share of a population, or null when there is no population to divide by.
 *
 * Returning null instead of 0 or 100 is the whole point: «none of zero passed»
 * is not a hundred per cent and is not a failure either, and a caller that has
 * to handle null cannot render either of those by accident.
 */
export function shareOrNull(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10_000) / 100;
}
