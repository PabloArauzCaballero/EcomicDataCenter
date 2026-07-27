import { canonicalHash, textHash } from '../../common/hashing/canonical-hash';

/** The semantic identity of a claim, excluding who reported it and when. */
export interface ClaimContent {
  readonly claimType: string;
  readonly assertion: string;
  readonly eventDate?: string | undefined;
  readonly statisticalDomainId?: string | undefined;
  readonly geographicUnitId?: string | undefined;
  readonly economicEntityId?: string | null | undefined;
}

/** Subject a claim speaks about, used to group potentially conflicting reports. */
export interface ClaimSubject {
  readonly statisticalDomainId: string | null;
  readonly geographicUnitId: string | null;
  readonly economicEntityId: string | null;
  readonly eventDate: string | null;
}

/**
 * Hashes what a claim asserts.
 *
 * The agent, run and timestamps are excluded so that two collectors reporting
 * the same finding produce the same hash and are recognised as duplicates
 * rather than as two independent facts.
 */
export function claimContentHash(content: ClaimContent): string {
  return canonicalHash({
    claimType: content.claimType,
    assertion: content.assertion.replace(/\s+/gu, ' ').trim().toLowerCase(),
    eventDate: content.eventDate ?? null,
    statisticalDomainId: content.statisticalDomainId ?? null,
    geographicUnitId: content.geographicUnitId ?? null,
    economicEntityId: content.economicEntityId ?? null,
  });
}

/** Extracts the subject a claim refers to. */
export function claimSubject(content: ClaimContent): ClaimSubject {
  return {
    statisticalDomainId: content.statisticalDomainId ?? null,
    geographicUnitId: content.geographicUnitId ?? null,
    economicEntityId: content.economicEntityId ?? null,
    eventDate: content.eventDate ?? null,
  };
}

/** True when a subject is specific enough for conflict detection to be meaningful. */
export function isComparableSubject(subject: ClaimSubject): boolean {
  const identifiers = [
    subject.statisticalDomainId,
    subject.geographicUnitId,
    subject.economicEntityId,
  ];
  return subject.eventDate !== null && identifiers.some((value) => value !== null);
}

/** Hashes an evidence excerpt so the same quotation is stored once per claim. */
export function evidenceHash(excerpt: string): string {
  return textHash(excerpt);
}

/** Hashes the untouched agent payload for the immutable raw layer. */
export function rawPayloadHash(payload: Record<string, unknown>): string {
  return canonicalHash(payload);
}
