import { ACTOR_ROLES } from '../../auth/actor';
import { describeActor, extractReference, referenceFromPath, summarizeBody } from '../audit-entry';

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

  /*
   * A persistence model keeps its attributes out of its own properties, so a
   * reader that only looks at those finds nothing and every write is recorded
   * as an action against no entity. This is the case that made the trail
   * unjoinable in practice, because handlers return rows.
   */
  it('reads the identifier of a result that presents itself through toJSON', () => {
    const row = {
      dataValues: { dataIssueId: 'issue-7', status: 'CLOSED' },
      toJSON(): unknown {
        return this.dataValues;
      },
    };
    expect(extractReference(row)).toBe('issue-7');
  });

  it('returns null when toJSON yields something that is not a record', () => {
    expect(extractReference({ toJSON: (): unknown => 'closed' })).toBeNull();
  });
});

describe('referenceFromPath', () => {
  it('takes the identifier the request named, deepest first', () => {
    expect(
      referenceFromPath('/api/v1/quality/issues/0b0e1f6c-17c9-4f4e-9e4a-6b6e0e2a1f11/transitions'),
    ).toBe('0b0e1f6c-17c9-4f4e-9e4a-6b6e0e2a1f11');
  });

  it('accepts a numeric identifier', () => {
    expect(referenceFromPath('/api/v1/quality/assessments/4821')).toBe('4821');
  });

  it('ignores the query string', () => {
    expect(referenceFromPath('/api/v1/quality/issues/4821?motivo=corregido')).toBe('4821');
  });

  it('returns null when the path names no identifier', () => {
    expect(referenceFromPath('/api/v1/quality/rules')).toBeNull();
  });
});
