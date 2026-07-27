import { ACTOR_ROLES, type Actor } from '../actor';
import { PUBLIC_CONFIDENTIALITY, resolveDisclosureScope } from '../disclosure.policy';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function actor(roles: Actor['roles'], organizationId?: string): Actor {
  return { subject: 'subject', roles, ...(organizationId ? { organizationId } : {}) };
}

describe('resolveDisclosureScope', () => {
  it('grants cross-institution reads to the methodology steward', () => {
    const scope = resolveDisclosureScope(actor([ACTOR_ROLES.METHODOLOGY_STEWARD]));
    expect(scope.unrestricted).toBe(true);
  });

  it('confines an analyst to public records plus its own organization', () => {
    const scope = resolveDisclosureScope(actor([ACTOR_ROLES.ANALYST], ORGANIZATION_ID));
    expect(scope).toEqual({ unrestricted: false, organizationId: ORGANIZATION_ID });
  });

  it('confines a reviewer without an organization to public records only', () => {
    const scope = resolveDisclosureScope(actor([ACTOR_ROLES.DATA_REVIEWER]));
    expect(scope).toEqual({ unrestricted: false, organizationId: null });
  });

  it('never grants unrestricted access to an ingestion agent', () => {
    const scope = resolveDisclosureScope(actor([ACTOR_ROLES.INGESTION_AGENT], ORGANIZATION_ID));
    expect(scope.unrestricted).toBe(false);
  });

  it('degrades to the least access when no actor is present', () => {
    expect(resolveDisclosureScope(undefined)).toEqual({
      unrestricted: false,
      organizationId: null,
    });
  });

  it('treats only explicitly public confidentiality values as shareable', () => {
    expect([...PUBLIC_CONFIDENTIALITY]).toEqual(['PUBLIC', 'FREE', 'OPEN']);
    expect(PUBLIC_CONFIDENTIALITY).not.toContain('RESTRICTED');
    expect(PUBLIC_CONFIDENTIALITY).not.toContain('CONFIDENTIAL');
  });
});
