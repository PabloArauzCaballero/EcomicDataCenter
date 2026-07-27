import type { Actor } from '../auth/actor';

/** One sensitive action, described without carrying its payload. */
export interface AuditEntry {
  readonly actorSubject: string;
  readonly actorRoles: string;
  readonly actorOrganizationId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityReference: string | null;
  readonly outcome: 'SUCCESS' | 'FAILURE';
  readonly correlationId: string;
  readonly clientContext: string | null;
  readonly details: Record<string, unknown>;
}

const ANONYMOUS_SUBJECT = 'anonymous';
const MAX_REFERENCE_LENGTH = 120;
const MAX_SUMMARY_KEYS = 40;

/** Describes the actor even when authentication failed before one was resolved. */
export function describeActor(actor: Actor | undefined): {
  actorSubject: string;
  actorRoles: string;
  actorOrganizationId: string | null;
} {
  return {
    actorSubject: actor?.subject.slice(0, 200) ?? ANONYMOUS_SUBJECT,
    actorRoles: (actor?.roles ?? []).join(',').slice(0, 200),
    actorOrganizationId: actor?.organizationId ?? null,
  };
}

/**
 * Summarises a request body by shape only.
 *
 * Agent submissions carry article excerpts and source content; storing them in
 * the audit trail would duplicate evidence into a table with a different
 * retention policy, so only the field names and sizes are kept.
 */
export function summarizeBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return { bodyPresent: body !== undefined };
  if (Array.isArray(body)) return { bodyType: 'array', itemCount: body.length };
  const keys = Object.keys(body as Record<string, unknown>);
  return {
    bodyType: 'object',
    fieldCount: keys.length,
    fields: keys.slice(0, MAX_SUMMARY_KEYS).sort(),
  };
}

/** Extracts a single identifier from a handler result without copying the body. */
export function extractReference(result: unknown): string | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  const candidate = Object.entries(record).find(
    ([key, value]) => key.toLowerCase().endsWith('id') && typeof value === 'string',
  );
  return candidate ? String(candidate[1]).slice(0, MAX_REFERENCE_LENGTH) : null;
}
