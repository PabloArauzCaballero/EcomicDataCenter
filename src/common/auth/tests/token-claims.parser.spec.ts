import { ACTOR_ROLES } from '../actor';
import { parseActorClaims } from '../token-claims.parser';

const environment = {
  AUTH_ROLE_CLAIM: 'roles',
  AUTH_ORGANIZATION_CLAIM: 'organization_id',
} as const;
const organizationId = '11111111-1111-4111-8111-111111111111';

describe('parseActorClaims', () => {
  it('deduplicates and filters roles', () => {
    const actor = parseActorClaims(
      {
        sub: 'subject-1',
        roles: ['ANALYST', 'ANALYST', 'UNKNOWN'],
      },
      environment,
    );
    expect(actor.roles).toEqual([ACTOR_ROLES.ANALYST]);
  });

  it('accepts a data officer with a UUID organization', () => {
    const actor = parseActorClaims(
      {
        sub: 'subject-2',
        roles: 'DATA_OFFICER',
        organization_id: organizationId,
      },
      environment,
    );
    expect(actor.organizationId).toBe(organizationId);
  });

  it('rejects a data officer without an organization', () => {
    expect(() =>
      parseActorClaims({ sub: 'subject-3', roles: ['DATA_OFFICER'] }, environment),
    ).toThrow('This role requires an organization claim');
  });

  it('rejects an ingestion agent without an organization', () => {
    expect(() =>
      parseActorClaims({ sub: 'agent-1', roles: ['INGESTION_AGENT'] }, environment),
    ).toThrow('This role requires an organization claim');
  });

  it('accepts an ingestion agent scoped to one organization', () => {
    const actor = parseActorClaims(
      { sub: 'agent-2', roles: ['INGESTION_AGENT'], organization_id: organizationId },
      environment,
    );
    expect(actor.roles).toEqual([ACTOR_ROLES.INGESTION_AGENT]);
    expect(actor.organizationId).toBe(organizationId);
  });

  it('refuses a token that mixes an agent identity with a human role', () => {
    expect(() =>
      parseActorClaims(
        {
          sub: 'agent-3',
          roles: ['INGESTION_AGENT', 'METHODOLOGY_STEWARD'],
          organization_id: organizationId,
        },
        environment,
      ),
    ).toThrow('An ingestion agent cannot hold additional roles');
  });

  it('refuses an agent that also claims the reviewer role it would be approved by', () => {
    expect(() =>
      parseActorClaims(
        {
          sub: 'agent-4',
          roles: ['INGESTION_AGENT', 'DATA_REVIEWER'],
          organization_id: organizationId,
        },
        environment,
      ),
    ).toThrow('An ingestion agent cannot hold additional roles');
  });

  it('rejects malformed organization identifiers', () => {
    expect(() =>
      parseActorClaims(
        { sub: 'subject-4', roles: ['ANALYST'], organization_id: 'not-a-uuid' },
        environment,
      ),
    ).toThrow('Organization claim is invalid');
  });
});
