import { ForbiddenException } from '@nestjs/common';
import type { Actor } from './actor';

/**
 * Enforces institutional isolation for an actor bound to one organization.
 *
 * An actor without an organization claim holds only unscoped custodian roles —
 * `token-claims.parser` rejects a scoped role that lacks the claim — so passing
 * through is the cross-institution visibility those roles are granted, not a
 * gap. The rule lives here in one place because a divergent copy is
 * indistinguishable from a missing check at the call site.
 */
export function assertActorOrganization(
  actor: Actor,
  organizationId: string,
  message: string,
): void {
  if (actor.organizationId && actor.organizationId !== organizationId) {
    throw new ForbiddenException(message);
  }
}
