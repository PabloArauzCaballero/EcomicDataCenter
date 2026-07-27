import { QueryTypes, type Sequelize } from 'sequelize';
import {
  createIntegrationDatabase,
  describeIntegration,
  truncateAll,
} from './database.harness';

const ORGANIZATION_ID = '99000000-0000-4000-8000-000000000001';
const AGENT_ID = '99000000-0000-4000-8000-000000000002';
const RUN_ID = '99000000-0000-4000-8000-000000000003';
const CLAIM_ID = '99000000-0000-4000-8000-000000000004';
const ARTIFACT_ID = '99000000-0000-4000-8000-000000000005';
const SOURCE_ID = '99000000-0000-4000-8000-000000000006';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

/**
 * Proves the guarantees that live in the database rather than in the services.
 *
 * These are the rules an application defect must not be able to bypass, so they
 * are exercised against real PostgreSQL: unit tests cannot observe a trigger, a
 * deferred constraint or a privilege.
 */
describeIntegration('database guarantees', () => {
  let database: Sequelize;

  beforeAll(() => {
    database = createIntegrationDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await truncateAll(database);
    await seedFixtures(database);
  });

  async function seedFixtures(connection: Sequelize): Promise<void> {
    await connection.query(
      `INSERT INTO provenance.organization VALUES
       (:organizationId, NULL, 'IT-ORG', 'Integration Org', 'IO', 'PUBLIC', 'BO', true, true, '2020-01-01', NULL)
       ON CONFLICT DO NOTHING`,
      { replacements: { organizationId: ORGANIZATION_ID } },
    );
    await connection.query(
      `INSERT INTO provenance.source VALUES
       (:sourceId, :organizationId, NULL, 'IT-SRC', 'Integration Source', 'OFFICIAL', 'API',
        NULL, NULL, NULL, NULL, true) ON CONFLICT DO NOTHING`,
      { replacements: { sourceId: SOURCE_ID, organizationId: ORGANIZATION_ID } },
    );
    await connection.query(
      `INSERT INTO provenance.source_artifact VALUES
       (:artifactId, :sourceId, 'DOCUMENT', NULL, NULL, 'mock://it', 'text/html', :sha,
        NULL, now(), NULL, '{}'::jsonb) ON CONFLICT DO NOTHING`,
      { replacements: { artifactId: ARTIFACT_ID, sourceId: SOURCE_ID, sha: 'c'.repeat(64) } },
    );
    await connection.query(
      `INSERT INTO intelligence.ai_agent VALUES
       (:agentId, :organizationId, 'IT-AGENT', 'Integration Agent', 'SECTOR', 'anthropic',
        'claude-opus-4-8', NULL, 'v1', 'v1', NULL, '{}'::jsonb, 'ACTIVE', NULL, true)`,
      { replacements: { agentId: AGENT_ID, organizationId: ORGANIZATION_ID } },
    );
    await connection.query(
      `INSERT INTO intelligence.agent_run VALUES
       (:runId, :agentId, 'it-corr', 'SCHEDULED', 1, 'RUNNING', now(), NULL,
        0, 0, 0, 0, 0, 0, NULL, NULL, NULL, 'v1', 'v1')`,
      { replacements: { runId: RUN_ID, agentId: AGENT_ID } },
    );
  }

  async function insertRaw(hash: string): Promise<void> {
    await database.query(
      `INSERT INTO intelligence.raw_observation
         (agent_run_id, payload_json, payload_hash, received_at, processing_status)
       VALUES (:runId, '{"value":1}'::jsonb, :hash, now(), 'RECEIVED')`,
      { replacements: { runId: RUN_ID, hash } },
    );
  }

  describe('raw observation immutability', () => {
    it('rejects any attempt to rewrite the submitted payload', async () => {
      await insertRaw(HASH_A);
      await expect(
        database.query(
          `UPDATE intelligence.raw_observation SET payload_json = '{"value":2}'::jsonb
           WHERE payload_hash = :hash`,
          { replacements: { hash: HASH_A } },
        ),
      ).rejects.toThrow(/immutable/iu);
    });

    it('allows the pipeline to advance the processing status', async () => {
      await insertRaw(HASH_A);
      await database.query(
        `UPDATE intelligence.raw_observation SET processing_status = 'NORMALIZED'
         WHERE payload_hash = :hash`,
        { replacements: { hash: HASH_A } },
      );
      const [row] = await database.query<{ processing_status: string }>(
        `SELECT processing_status FROM intelligence.raw_observation WHERE payload_hash = :hash`,
        { replacements: { hash: HASH_A }, type: QueryTypes.SELECT },
      );
      expect(row?.processing_status).toBe('NORMALIZED');
    });

    it('refuses deletion so evidence of what an agent sent cannot vanish', async () => {
      await insertRaw(HASH_A);
      await expect(
        database.query(`DELETE FROM intelligence.raw_observation WHERE payload_hash = :hash`, {
          replacements: { hash: HASH_A },
        }),
      ).rejects.toThrow(/immutable/iu);
    });

    it('deduplicates a retried submission of the same payload in one run', async () => {
      await insertRaw(HASH_A);
      // Sequelize reports a unique violation as a validation error, so the
      // assertion checks the effect on the table rather than the wrapper class.
      await expect(insertRaw(HASH_A)).rejects.toThrow();
      const [row] = await database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM intelligence.raw_observation WHERE payload_hash = :hash`,
        { replacements: { hash: HASH_A }, type: QueryTypes.SELECT },
      );
      expect(row?.count).toBe('1');
    });

    it('accepts distinct payloads within the same run', async () => {
      await insertRaw(HASH_A);
      await insertRaw(HASH_B);
      const [row] = await database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM intelligence.raw_observation WHERE agent_run_id = :runId`,
        { replacements: { runId: RUN_ID }, type: QueryTypes.SELECT },
      );
      expect(row?.count).toBe('2');
    });
  });

  describe('audit trail', () => {
    beforeEach(async () => {
      await database.query(
        `INSERT INTO audit.audit_log
           (actor_subject, actor_roles, action, entity_type, outcome, correlation_id,
            details_json, occurred_at)
         VALUES ('it-subject', 'ANALYST', 'POST /x', 'x', 'SUCCESS', 'corr', '{}'::jsonb, now())`,
      );
    });

    it('rejects updates so a recorded action cannot be rewritten', async () => {
      await expect(
        database.query(`UPDATE audit.audit_log SET action = 'tampered'`),
      ).rejects.toThrow(/append-only/iu);
    });

    it('rejects deletes so a recorded action cannot be erased', async () => {
      await expect(database.query(`DELETE FROM audit.audit_log`)).rejects.toThrow(/append-only/iu);
    });
  });

  describe('published claims require evidence', () => {
    async function insertClaim(status: string, hash: string): Promise<unknown> {
      return database.query(
        `INSERT INTO intelligence.fact_claim
           (fact_claim_id, agent_run_id, claim_type, assertion, confidence_level, status,
            content_hash, created_at)
         VALUES (:claimId, :runId, 'FACT', 'Una afirmacion de prueba suficientemente larga',
                 'HIGH', :status, :hash, now())`,
        { replacements: { claimId: CLAIM_ID, runId: RUN_ID, status, hash } },
      );
    }

    it('aborts a published claim that carries no evidence', async () => {
      await expect(insertClaim('PUBLISHED', HASH_A)).rejects.toThrow(/evidence/iu);
    });

    it('permits a claim held for review without evidence', async () => {
      await expect(insertClaim('PENDING_REVIEW', HASH_A)).resolves.toBeDefined();
    });

    it('permits publication once an evidence excerpt exists', async () => {
      await database.query('BEGIN');
      await database.query(
        `INSERT INTO intelligence.fact_claim
           (fact_claim_id, agent_run_id, claim_type, assertion, confidence_level, status,
            content_hash, created_at)
         VALUES (:claimId, :runId, 'FACT', 'Una afirmacion de prueba suficientemente larga',
                 'HIGH', 'PUBLISHED', :hash, now())`,
        { replacements: { claimId: CLAIM_ID, runId: RUN_ID, hash: HASH_A } },
      );
      await database.query(
        `INSERT INTO intelligence.claim_evidence
           (fact_claim_id, source_artifact_id, excerpt, excerpt_hash, locator, retrieved_at)
         VALUES (:claimId, :artifactId, 'Un extracto citado de la fuente original', :hash,
                 'https://example.org/report', now())`,
        { replacements: { claimId: CLAIM_ID, artifactId: ARTIFACT_ID, hash: HASH_B } },
      );
      await expect(database.query('COMMIT')).resolves.toBeDefined();
    });
  });

  describe('contradictions', () => {
    it('lets two conflicting records about one subject coexist', async () => {
      const insert = (primary: string, contradicting: string): Promise<unknown> =>
        database.query(
          `INSERT INTO intelligence.data_contradiction
             (data_contradiction_id, subject_type, primary_reference, contradicting_reference,
              detection_method, status, detected_at)
           VALUES (gen_random_uuid(), 'FACT_CLAIM', :primary, :contradicting,
                   'CONFLICTING_ASSERTION', 'OPEN', now())`,
          { replacements: { primary, contradicting } },
        );
      await expect(insert('claim-a', 'claim-b')).resolves.toBeDefined();
      const [row] = await database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM intelligence.data_contradiction WHERE status = 'OPEN'`,
        { type: QueryTypes.SELECT },
      );
      expect(row?.count).toBe('1');
    });

    it('refuses to resolve a contradiction without a rationale', async () => {
      await database.query(
        `INSERT INTO intelligence.data_contradiction
           (data_contradiction_id, subject_type, primary_reference, contradicting_reference,
            detection_method, status, detected_at)
         VALUES (:id, 'FACT_CLAIM', 'claim-a', 'claim-b', 'MANUAL', 'OPEN', now())`,
        { replacements: { id: CLAIM_ID } },
      );
      await expect(
        database.query(
          `UPDATE intelligence.data_contradiction
           SET status = 'RESOLVED', resolved_at = now() WHERE data_contradiction_id = :id`,
          { replacements: { id: CLAIM_ID } },
        ),
      ).rejects.toThrow(/ck_data_contradiction_resolution_completeness/iu);
    });
  });

  describe('review decisions', () => {
    it('refuses an approval that names no reviewer and gives no rationale', async () => {
      await database.query(
        `INSERT INTO intelligence.review_task
           (review_task_id, target_type, target_reference, reason, priority, status, created_at)
         VALUES (:id, 'FACT_CLAIM', :claimId, 'AI_INFERENCE', 'NORMAL', 'PENDING', now())`,
        { replacements: { id: CLAIM_ID, claimId: CLAIM_ID } },
      );
      await expect(
        database.query(
          `UPDATE intelligence.review_task SET status = 'APPROVED' WHERE review_task_id = :id`,
          { replacements: { id: CLAIM_ID } },
        ),
      ).rejects.toThrow(/ck_review_task_decision_completeness/iu);
    });
  });
});
