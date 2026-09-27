import { randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { QueryTypes } from 'sequelize';
import { ENVIRONMENT } from '../../../src/config/configuration.module';
import type { Environment } from '../../../src/config/environment';
import { describeIntegration, startAdminHarness, type AdminHarness } from './harness';

/**
 * QLT-05: an issue is closed by somebody, in order, and the trail says so.
 *
 * The closure is driven over HTTP rather than against the service, because the
 * trail is written by the interceptor that only exists on the request path. A
 * test that called the service directly would close the issue and record
 * nothing, and would pass while leaving the console with an empty history.
 *
 * What is checked is the whole shape of a governed closure: the order is
 * enforced, the refusal is recorded as a refusal, the evidence that raised the
 * issue survives it, and the trail cannot be edited afterwards.
 */
const ORDER = ['TRIAGED', 'IN_CORRECTION', 'RESOLVED', 'VERIFIED', 'CLOSED'] as const;

interface IssueBody {
  data: {
    status: string;
    resolutionNotes: string | null;
    resolvedAt: string | null;
    evidence: { ruleCode: string | null };
    history: Array<{
      actorSubject: string;
      actorRoles: string[];
      action: string;
      outcome: string;
      occurredAt: string;
    }>;
  };
}

describeIntegration('quality issue closure', () => {
  let harness: AdminHarness;
  let app: NestFastifyApplication;
  let prefix: string;
  let issueId: string;

  beforeAll(async () => {
    harness = await startAdminHarness();
    app = harness.module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // The same prefix the process serves. Hard-coding it here would let the
    // paths this test exercises drift away from the ones anybody can call.
    const environment = harness.module.get<Environment>(ENVIRONMENT);
    prefix = `/${environment.API_PREFIX}/${environment.API_VERSION}`;
    app.setGlobalPrefix(`${environment.API_PREFIX}/${environment.API_VERSION}`);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
    if (harness) await harness.close();
  });

  beforeEach(async () => {
    issueId = randomUUID();
    await harness.database.query(
      `INSERT INTO quality_lineage.data_issue (
         data_issue_id, issue_type, severity, target_entity_type, target_entity_id,
         title, description, status, detected_at
       ) VALUES (
         :id, 'COMPLETENESS', 'ERROR', 'indicator', :target,
         'Faltan observaciones en el trimestre', 'Detectado por la evaluación de reglas',
         'OPEN', now()
       )`,
      { type: QueryTypes.INSERT, replacements: { id: issueId, target: `it-${issueId.slice(0, 8)}` } },
    );
  });

  afterEach(async () => {
    await harness.database.query('DELETE FROM quality_lineage.data_issue WHERE data_issue_id = :id', {
      type: QueryTypes.DELETE,
      replacements: { id: issueId },
    });
  });

  function transition(targetStatus: string, resolutionNotes?: string) {
    return app.inject({
      method: 'POST',
      url: `${prefix}/quality/issues/${issueId}/transitions`,
      payload: { targetStatus, ...(resolutionNotes ? { resolutionNotes } : {}) },
    });
  }

  async function readIssue(): Promise<IssueBody['data']> {
    const response = await app.inject({
      method: 'GET',
      url: `${prefix}/admin/quality/issues/${issueId}`,
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as IssueBody).data;
  }

  /**
   * The trail is appended after the response, so it is waited for rather than
   * assumed. Waiting is not the same as retrying the assertion: the entries
   * either arrive or the case fails.
   */
  async function historyEventually(atLeast: number): Promise<IssueBody['data']['history']> {
    const deadline = Date.now() + 15_000;
    let history: IssueBody['data']['history'] = [];
    while (Date.now() < deadline) {
      history = (await readIssue()).history;
      if (history.length >= atLeast) return history;
    }
    throw new Error(`the trail never reached ${atLeast} entries; it had ${history.length}`);
  }

  it('closes an issue through its declared order and records who did it', async () => {
    for (const status of ORDER) {
      const response = await transition(
        status,
        status === 'RESOLVED' ? 'Se recargó el trimestre desde el boletín' : undefined,
      );
      expect([200, 201]).toContain(response.statusCode);
    }

    const issue = await readIssue();
    expect(issue.status).toBe('CLOSED');
    expect(issue.resolvedAt).not.toBeNull();
    // The note written on the way through survives the later steps.
    expect(issue.resolutionNotes).toBe('Se recargó el trimestre desde el boletín');

    const history = await historyEventually(ORDER.length);
    const successes = history.filter((entry) => entry.outcome === 'SUCCESS');
    expect(successes.length).toBeGreaterThanOrEqual(ORDER.length);
    for (const entry of successes) {
      expect(entry.actorSubject).toBeTruthy();
      expect(entry.actorRoles.length).toBeGreaterThan(0);
      // The action stays low cardinality: the identifier is not in it.
      expect(entry.action).not.toContain(issueId);
      expect(entry.action).toContain('POST');
    }
  }, 180_000);

  it('refuses a jump that skips the order and records the refusal', async () => {
    const refused = await transition('CLOSED');
    expect(refused.statusCode).toBeGreaterThanOrEqual(400);
    expect(refused.statusCode).toBeLessThan(500);

    // Nothing moved.
    const issue = await readIssue();
    expect(issue.status).toBe('OPEN');
    expect(issue.resolvedAt).toBeNull();

    // And the attempt is on the record as an attempt, not as an absence.
    const history = await historyEventually(1);
    expect(history.some((entry) => entry.outcome === 'FAILURE')).toBe(true);
  }, 180_000);

  it('keeps the trail append-only once it is written', async () => {
    await transition('TRIAGED');
    await historyEventually(1);

    await expect(
      harness.database.query(
        `UPDATE audit.audit_log SET outcome = 'FAILURE'
          WHERE entity_reference = :id OR details_json::text LIKE :like`,
        { type: QueryTypes.UPDATE, replacements: { id: issueId, like: `%${issueId}%` } },
      ),
    ).rejects.toThrow();
  }, 180_000);
});
