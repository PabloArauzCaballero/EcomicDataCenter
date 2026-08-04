import { ACTOR_ROLES, type Actor } from './actor';

/**
 * Institution the hosted collector writes for.
 *
 * The same identifier is declared by `boot/agent-bootstrap.json`, which seeds
 * the organization, its collection source and the registered agent. The pair is
 * asserted by `tests/hosted-collector.actor.spec.ts` so the constant and the
 * catalog cannot drift into a deployment that authenticates but cannot write.
 */
export const HOSTED_COLLECTOR_ORGANIZATION_ID = '92000000-0000-4000-8000-000000000001';

/** Subject recorded in every audit row produced by the shared-key credential. */
export const HOSTED_COLLECTOR_SUBJECT = 'hosted-collector';

/**
 * Builds the only identity `AUTH_MODE=agent_key` ever grants.
 *
 * The mode authenticates a single long-lived secret rather than a token issued
 * per request, so the credential cannot be scoped or revoked by an identity
 * provider. It therefore carries the collector role alone: review, governance
 * and the official observation endpoints stay default-deny, and a leaked key
 * buys an attacker nothing more than the ability to file claims that a human
 * role still has to approve before they become institutional facts.
 */
export function createHostedCollectorActor(): Actor {
  return {
    subject: HOSTED_COLLECTOR_SUBJECT,
    roles: [ACTOR_ROLES.INGESTION_AGENT],
    organizationId: HOSTED_COLLECTOR_ORGANIZATION_ID,
  };
}
