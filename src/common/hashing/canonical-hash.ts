import { createHash } from 'node:crypto';

/** Orders object keys recursively so equal payloads hash equally. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

/**
 * Hashes a value independently of key order.
 *
 * Two callers rely on this: ingestion replay detection and duplicate detection
 * for agent submissions. Both need a client that serialises the same data in a
 * different field order to produce the same fingerprint.
 */
export function canonicalHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

/** Hashes free text after collapsing whitespace, for evidence comparison. */
export function textHash(value: string): string {
  return createHash('sha256').update(value.replace(/\s+/gu, ' ').trim()).digest('hex');
}
