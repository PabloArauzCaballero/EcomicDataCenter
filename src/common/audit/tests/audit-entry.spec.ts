import { ACTOR_ROLES } from '../../auth/actor';
import { describeActor, extractReference, summarizeBody } from '../audit-entry';

describe('describeActor', () => {
  it('describes an authenticated actor', () => {
    expect(
      describeActor({
        subject: 'agent-exchange-01',
        roles: [ACTOR_ROLES.INGESTION_AGENT],
        organizationId: '33333333-3333-4333-8333-333333333333',
      }),
    ).toEqual({
      actorSubject: 'agent-exchange-01',
      actorRoles: 'INGESTION_AGENT',
      actorOrganizationId: '33333333-3333-4333-8333-333333333333',
    });
  });

  it('still describes a request that failed before authentication', () => {
    expect(describeActor(undefined)).toEqual({
      actorSubject: 'anonymous',
      actorRoles: '',
      actorOrganizationId: null,
    });
  });
});

describe('summarizeBody', () => {
  it('records the shape of a submission without copying its content', () => {
    const summary = summarizeBody({
      submissionCode: 'RUN-1',
      items: [{ claim: { assertion: 'Confidential excerpt that must not be duplicated' } }],
    });
    expect(summary).toEqual({
      bodyType: 'object',
      fieldCount: 2,
      fields: ['items', 'submissionCode'],
    });
    expect(JSON.stringify(summary)).not.toContain('Confidential');
  });

  it('summarizes an array body by length only', () => {
    expect(summarizeBody([1, 2, 3])).toEqual({ bodyType: 'array', itemCount: 3 });
  });

  it('reports an absent body', () => {
    expect(summarizeBody(undefined)).toEqual({ bodyPresent: false });
  });

  it('caps the recorded field list so a hostile payload cannot inflate the trail', () => {
    const wide = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [`f${index}`, index]),
    );
    const summary = summarizeBody(wide) as { fields: string[]; fieldCount: number };
    expect(summary.fieldCount).toBe(200);
    expect(summary.fields).toHaveLength(40);
  });
});

describe('extractReference', () => {
  it('extracts the identifier a handler returned', () => {
    expect(extractReference({ agentRunId: 'run-1', status: 'RUNNING' })).toBe('run-1');
  });

  it('returns null when the result carries no identifier', () => {
    expect(extractReference({ status: 'ok' })).toBeNull();
  });

  it('returns null for a list result', () => {
    expect(extractReference([{ id: 'a' }])).toBeNull();
  });

  it('ignores a non-string identifier', () => {
    expect(extractReference({ observationId: 42 })).toBeNull();
  });
});
