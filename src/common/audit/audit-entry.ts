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
  const keys = Object.keys(body);
  return {
    bodyType: 'object',
    fieldCount: keys.length,
    fields: keys.slice(0, MAX_SUMMARY_KEYS).sort(),
  };
}

/**
 * Extracts a single identifier from a handler result without copying the body.
 *
 * The result is read through `toJSON` when it offers one. A Sequelize instance
 * keeps its attributes in `dataValues` and exposes them through prototype
 * getters, so reading its own properties finds no identifier at all: every
 * handler that returns a row was recorded as an action against nothing, and the
 * screens that ask «what happened to this entity» had nothing to join on.
 */
export function extractReference(result: unknown): string | null {
  const record = readable(result);
  if (!record) return null;
  const candidate = Object.entries(record).find(
    ([key, value]) => key.toLowerCase().endsWith('id') && typeof value === 'string',
  );
  return candidate ? String(candidate[1]).slice(0, MAX_REFERENCE_LENGTH) : null;
}

/** The plain shape of a result, whether it is a literal or a model instance. */
function readable(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const candidate = result as { toJSON?: unknown };
  if (typeof candidate.toJSON === 'function') {
    const plain: unknown = (candidate as { toJSON: () => unknown }).toJSON();
    return plain && typeof plain === 'object' && !Array.isArray(plain)
      ? (plain as Record<string, unknown>)
      : null;
  }
  return result as Record<string, unknown>;
}

/**
 * The identifier the request itself named, used when the result carries none.
 *
 * A refusal has no result to read, and a handler that answers with no content
 * still acted on something. Without this, the only requests attributable to an
 * entity were the ones that succeeded and returned it, which is precisely the
 * subset an audit trail must not be limited to.
 */
export function referenceFromPath(url: string): string | null {
  const [pathname] = url.split('?');
  const segments = (pathname ?? '').split('/').filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment && IDENTIFIER_SEGMENT.test(segment)) {
      return segment.slice(0, MAX_REFERENCE_LENGTH);
    }
  }
  return null;
}

const IDENTIFIER_SEGMENT = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/iu;
