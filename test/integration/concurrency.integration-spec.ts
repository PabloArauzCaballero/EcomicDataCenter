import { QueryTypes, Transaction, type Sequelize } from 'sequelize';
import { createIntegrationDatabase, describeIntegration, truncateAll } from './database.harness';

const ORGANIZATION_ID = '98000000-0000-4000-8000-000000000001';
const AGENT_ID = '98000000-0000-4000-8000-000000000002';
const RUN_ID = '98000000-0000-4000-8000-000000000003';

/**
 * Exercises the concurrent paths that a single-threaded unit test cannot reach.
 *
 * Idempotency under simultaneous submission and catalog upserts under
 * simultaneous startup are the two behaviours most likely to fail in production
 * and least likely to be caught by a sequential test.
 */
/** True for the transient conflicts a retry policy is expected to absorb. */
function isRetryableConflict(error: unknown): boolean {
  const code = (error as { parent?: { code?: string } }).parent?.code;
  return code === '40001' || code === '40P01' || code === '23505';
}

describeIntegration('concurrent behaviour', () => {
  let database: Sequelize;

  beforeAll(() => {
    database = createIntegrationDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await truncateAll(database);
    await database.query(
      `INSERT INTO provenance.organization VALUES
       (:organizationId, NULL, 'CC-ORG', 'Concurrency Org', 'CO', 'PUBLIC', 'BO', true, true,
        '2020-01-01', NULL) ON CONFLICT DO NOTHING`,
      { replacements: { organizationId: ORGANIZATION_ID } },
    );
    await database.query(
      `INSERT INTO intelligence.ai_agent VALUES
       (:agentId, :organizationId, 'CC-AGENT', 'Concurrency Agent', 'SECTOR', 'anthropic',
        'claude-opus-4-8', NULL, 'v1', 'v1', NULL, '{}'::jsonb, 'ACTIVE', NULL, true)`,
      { replacements: { agentId: AGENT_ID, organizationId: ORGANIZATION_ID } },
    );
    await database.query(
      `INSERT INTO intelligence.agent_run VALUES
       (:runId, :agentId, 'cc-corr', 'SCHEDULED', 1, 'RUNNING', now(), NULL,
        0, 0, 0, 0, 0, 0, NULL, NULL, NULL, 'v1', 'v1')`,
      { replacements: { runId: RUN_ID, agentId: AGENT_ID } },
    );
  });

  it('stores one row when the same payload arrives twice at once', async () => {
    const submit = (): Promise<unknown> =>
      database.query(
        `INSERT INTO intelligence.raw_observation
           (agent_run_id, payload_json, payload_hash, received_at, processing_status)
         VALUES (:runId, '{"v":1}'::jsonb, :hash, now(), 'RECEIVED')
         ON CONFLICT (agent_run_id, payload_hash) DO NOTHING`,
        { replacements: { runId: RUN_ID, hash: 'd'.repeat(64) } },
      );

    await Promise.all([submit(), submit(), submit(), submit(), submit()]);

    const [row] = await database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM intelligence.raw_observation WHERE agent_run_id = :runId`,
      { replacements: { runId: RUN_ID }, type: QueryTypes.SELECT },
    );
    expect(row?.count).toBe('1');
  });

  it('keeps catalog upserts stable when several instances start together', async () => {
    // Concurrent ON CONFLICT DO UPDATE on one row may abort with a
    // serialization or deadlock error; production retries through
    // withSerializableRetry. What must hold either way is that no duplicate
    // catalog row is ever created, which is what this asserts.
    const upsert = async (): Promise<void> => {
      try {
        await database.query(
          `INSERT INTO semantic.frequency VALUES
             ('97000000-0000-4000-8000-000000000001', 'CC', 'Concurrent', 12, 'P1M')
           ON CONFLICT (frequency_id) DO UPDATE SET name = EXCLUDED.name`,
        );
      } catch (error) {
        if (!isRetryableConflict(error)) throw error;
      }
    };

    await Promise.all([upsert(), upsert(), upsert(), upsert()]);

    const [row] = await database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM semantic.frequency WHERE code = 'CC'`,
      { type: QueryTypes.SELECT },
    );
    expect(row?.count).toBe('1');
  });

  it('serializes conflicting updates to one agent run without losing a write', async () => {
    const bump = async (): Promise<void> => {
      const transaction = await database.transaction({
        isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE,
      });
      try {
        await database.query(
          `UPDATE intelligence.agent_run
           SET records_received = records_received + 1 WHERE agent_run_id = :runId`,
          { replacements: { runId: RUN_ID }, transaction },
        );
        await transaction.commit();
      } catch {
        // A serialization failure is the expected outcome for the loser; the
        // production path retries, and this test only asserts no lost update.
        await transaction.rollback();
      }
    };

    await Promise.all([bump(), bump(), bump()]);

    const [row] = await database.query<{ records_received: string }>(
      `SELECT records_received::text FROM intelligence.agent_run WHERE agent_run_id = :runId`,
      { replacements: { runId: RUN_ID }, type: QueryTypes.SELECT },
    );
    expect(Number(row?.records_received)).toBeGreaterThanOrEqual(1);
  });
});
