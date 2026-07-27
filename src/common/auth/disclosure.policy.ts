import { ACTOR_ROLES, type Actor } from './actor';

/**
 * Confidentiality values that any authenticated institution may read.
 *
 * Everything else is restricted to the producing organization, because a
 * datacenter shared by the ministry, the professional association, financial
 * institutions and analysts must not let one consumer read another's
 * unpublished figures merely because both hold a valid token.
 */
export const PUBLIC_CONFIDENTIALITY = ['PUBLIC', 'FREE', 'OPEN'] as const;

/** Roles that act as national custodian and may read across institutions. */
const CROSS_INSTITUTION_ROLES: readonly string[] = [ACTOR_ROLES.METHODOLOGY_STEWARD];

export interface DisclosureScope {
  /** True when the actor may read restricted records of any organization. */
  readonly unrestricted: boolean;
  /** Organization whose restricted records the actor may read, when scoped. */
  readonly organizationId: string | null;
}

/**
 * Resolves what an actor is allowed to see.
 *
 * An actor without an organization claim and without a custodian role can only
 * ever reach public records; that is the safe default rather than an error, so
 * a misconfigured token degrades to less access instead of more.
 */
export function resolveDisclosureScope(actor: Actor | undefined): DisclosureScope {
  if (!actor) return { unrestricted: false, organizationId: null };
  if (actor.roles.some((role) => CROSS_INSTITUTION_ROLES.includes(role))) {
    return { unrestricted: true, organizationId: actor.organizationId ?? null };
  }
  return { unrestricted: false, organizationId: actor.organizationId ?? null };
}
