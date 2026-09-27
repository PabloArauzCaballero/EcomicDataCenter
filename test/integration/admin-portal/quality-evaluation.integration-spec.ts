import { randomUUID } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import {
  QualityEvaluationService,
  type EvaluationOutcome,
} from '../../../src/modules/quality/quality-evaluation.service';
import { describeIntegration, startAdminHarness, type AdminHarness } from './harness';

/**
 * QLT-01 to QLT-04, against a population small enough to count by hand.
 *
 * Ten claims, eight of them with evidence. A rule that reports «80 %» and
 * cannot say eighty per cent of what is a rule nobody can argue with, so every
 * assertion here is about the pair — and the case that matters most is the one
 * where the population is empty and the answer is neither zero nor a hundred.
 */
const ORGANIZATION = '11110000-0000-4000-8000-000000000001';
const AGENT = '11110000-0000-4000-8000-000000000002';
const RUN = '11110000-0000-4000-8000-000000000003';
const SOURCE = '11110000-0000-4000-8000-000000000004';
const ARTIFACT = '11110000-0000-4000-8000-000000000005';

interface AssessmentRow {
  status: string;
  numerator: string | null;
  denominator: string | null;
  not_evaluated: string | null;
  rule_version: string | null;
  evaluation_scope: string | null;
}

describeIntegration('collection quality evaluation', () => {
  let harness: AdminHarness;
  let service: QualityEvaluationService;

  beforeAll(async () => {
    harness = await startAdminHarness();
    service = harness.module.get(QualityEvaluationService);
  }, 120_000);

  afterAll(async () => {
    if (harness) await harness.close();
  });

  beforeEach(async () => {
    await harness.database.query(`
TRUNCATE TABLE
  quality_lineage.data_issue,
  quality_lineage.quality_assessment,
  intelligence.claim_evidence,
  intelligence.entity_mention,
  intelligence.data_contradiction,
  intelligence.review_task,
  intelligence.fact_claim,
  intelligence.raw_observation,
  intelligence.agent_run,
  intelligence.ai_agent
RESTART IDENTITY CASCADE;
    `);
  });

  /** Ten claims, eight with evidence, so the answer can be checked by hand. */
  async function seedClaims(total: number, withEvidence: number): Promise<void> {
    await harness.database.query(
      `INSERT INTO provenance.organization (
         organization_id, code, legal_name, short_name, organization_type,
         country_code, official_statistics_producer, is_active, valid_from
       ) VALUES (:organization, 'QLT-ORG', 'Organización de prueba', 'QLT', 'RESEARCH_OBSERVATORY',
                 'BO', false, true, CURRENT_DATE)
       ON CONFLICT (organization_id) DO NOTHING`,
      { type: QueryTypes.INSERT, replacements: { organization: ORGANIZATION } },
    );
    await harness.database.query(
      `INSERT INTO provenance.source (
         source_id, organization_id, code, name, source_type, access_method, is_active,
         official_uri
       ) VALUES (:source, :organization, 'QLT-SRC', 'Fuente de prueba', 'OFFICIAL', 'API', true,
                 'https://ejemplo.bo/qlt')
       ON CONFLICT (source_id) DO NOTHING`,
      { type: QueryTypes.INSERT, replacements: { source: SOURCE, organization: ORGANIZATION } },
    );
    await harness.database.query(
      `INSERT INTO provenance.source_artifact (
         source_artifact_id, source_id, artifact_type, storage_uri, original_uri, sha256,
         retrieved_at, metadata_json
       ) VALUES (:artifact, :source, 'JSON', 'test://qlt', 'https://ejemplo.bo/qlt',
                 repeat('a', 64), now(), '{}'::jsonb)
       ON CONFLICT (source_artifact_id) DO NOTHING`,
      { type: QueryTypes.INSERT, replacements: { artifact: ARTIFACT, source: SOURCE } },
    );
    await harness.database.query(
      `INSERT INTO intelligence.ai_agent (
         ai_agent_id, organization_id, code, name, agent_type, provider, model_identifier,
         prompt_version, schema_version, status, is_active, configuration_json
       ) VALUES (:agent, :organization, 'QLT-AGENT', 'Agente de prueba', 'SECTOR', 'prueba',
                 'modelo', '1', '1', 'ACTIVE', true, '{}'::jsonb)`,
      { type: QueryTypes.INSERT, replacements: { agent: AGENT, organization: ORGANIZATION } },
    );
    await harness.database.query(
      `INSERT INTO intelligence.agent_run (
         agent_run_id, ai_agent_id, correlation_id, trigger_type, attempt_no, status, started_at,
         sources_consulted, records_received, records_accepted, records_rejected,
         records_quarantined, warning_count, prompt_version, schema_version
       ) VALUES (:run, :agent, 'qlt', 'MANUAL', 1, 'SUCCEEDED', now(), 1, 0, 0, 0, 0, 0, '1', '1')`,
      { type: QueryTypes.INSERT, replacements: { run: RUN, agent: AGENT } },
    );

    for (let index = 0; index < total; index += 1) {
      const claimId = randomUUID();
      const figure = `${10 + index}.5`;
      await harness.database.query(
        `INSERT INTO intelligence.raw_observation (
           agent_run_id, payload_json, payload_hash, received_at, processing_status
         ) VALUES (:run, CAST(:payload AS jsonb), :hash, now(), 'NORMALIZED')`,
        {
          type: QueryTypes.INSERT,
          replacements: {
            run: RUN,
            payload: JSON.stringify({ index }),
            hash: index.toString(16).padStart(64, '0'),
          },
        },
      );
      await harness.database.query(
        `INSERT INTO intelligence.fact_claim (
           fact_claim_id, agent_run_id, claim_type, assertion, event_date, confidence_level,
           confidence_score, status, content_hash, created_at
         ) VALUES (:claim, :run, 'FACT', :assertion, CURRENT_DATE - 1, 'HIGH', '0.9000',
                   'PENDING_REVIEW', :hash, now())`,
        {
          type: QueryTypes.INSERT,
          replacements: {
            claim: claimId,
            run: RUN,
            assertion: `El indicador de prueba marcó ${figure} por ciento en la medición.`,
            hash: (index + 1000).toString(16).padStart(64, '0'),
          },
        },
      );
      if (index < withEvidence) {
        await harness.database.query(
          `INSERT INTO intelligence.claim_evidence (
             fact_claim_id, source_artifact_id, excerpt, excerpt_hash, locator, retrieved_at
           ) VALUES (:claim, :artifact, :excerpt, :hash, 'https://ejemplo.bo/qlt', now())`,
          {
            type: QueryTypes.INSERT,
            replacements: {
              claim: claimId,
              artifact: ARTIFACT,
              excerpt: `La cifra publicada fue de ${figure} por ciento según el boletín oficial.`,
              hash: (index + 2000).toString(16).padStart(64, '0'),
            },
          },
        );
      }
    }
  }

  function find(outcomes: readonly EvaluationOutcome[], code: string): EvaluationOutcome {
    const outcome = outcomes.find((entry) => entry.ruleCode === code);
    if (!outcome) throw new Error(`La regla ${code} no se evaluó`);
    return outcome;
  }

  /** QLT-01: eight of ten is 80 %, with the denominator stated and two failures. */
  it('reports 8 of 10 as 80 % and names the population', async () => {
    await seedClaims(10, 8);
    const outcomes = await service.evaluateAll(new Date('2026-09-16T12:00:00.000Z'));
    const evidence = find(outcomes, 'CLAIM_HAS_EVIDENCE');

    expect(evidence.numerator).toBe(8);
    expect(evidence.denominator).toBe(10);
    expect(evidence.share).toBe(80);
    expect(evidence.status).toBe('FAIL');

    const stored = await harness.database.query<AssessmentRow>(
      `SELECT assessment.status, assessment.numerator::text AS numerator,
              assessment.denominator::text AS denominator,
              assessment.not_evaluated::text AS not_evaluated,
              assessment.rule_version, assessment.evaluation_scope
         FROM quality_lineage.quality_assessment assessment
         JOIN quality_lineage.quality_rule rule
           ON rule.quality_rule_id = assessment.quality_rule_id
        WHERE rule.code = 'CLAIM_HAS_EVIDENCE'`,
      { type: QueryTypes.SELECT },
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]?.numerator).toBe('8');
    expect(stored[0]?.denominator).toBe('10');
    expect(stored[0]?.rule_version).toBe('1.0.0');
    expect(stored[0]?.evaluation_scope).toBe('claims:draft-and-pending');
  }, 120_000);

  /** QLT-02: nothing to measure is «not evaluated», never a hundred per cent. */
  it('reports an empty population as NOT_EVALUATED with a null share', async () => {
    const outcomes = await service.evaluateAll(new Date('2026-09-16T12:00:00.000Z'));
    const evidence = find(outcomes, 'CLAIM_HAS_EVIDENCE');
    expect(evidence.denominator).toBe(0);
    expect(evidence.share).toBeNull();
    expect(evidence.status).toBe('NOT_EVALUATED');
  }, 120_000);

  /**
   * QLT-03: textual support is not truth.
   *
   * Every claim here quotes its own figure accurately, so the rule passes — and
   * it is named for what it checked. Nothing in this result says the figure was
   * right, and the rule's own name is what stops it being read that way.
   */
  it('checks that the figure appears in the excerpt, and says so in the rule name', async () => {
    await seedClaims(4, 4);
    const outcomes = await service.evaluateAll(new Date('2026-09-16T12:00:00.000Z'));
    const support = find(outcomes, 'CLAIM_TEXTUAL_SUPPORT');
    expect(support.denominator).toBe(4);
    expect(support.numerator).toBe(4);

    const rule = await harness.database.query<{ name: string }>(
      `SELECT name FROM quality_lineage.quality_rule WHERE code = 'CLAIM_TEXTUAL_SUPPORT'`,
      { type: QueryTypes.SELECT },
    );
    expect(rule[0]?.name).toContain('respaldo textual');
    expect(rule[0]?.name).toContain('no verdad');
  }, 120_000);

  /** QLT-04: re-running at the same cutoff replaces; a new cutoff is a new row. */
  it('replaces the evaluation at one cutoff and keeps history across cutoffs', async () => {
    await seedClaims(10, 8);
    const first = new Date('2026-09-16T12:00:00.000Z');
    await service.evaluateAll(first);
    await service.evaluateAll(first);

    const sameCutoff = await harness.database.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM quality_lineage.quality_assessment assessment
         JOIN quality_lineage.quality_rule rule
           ON rule.quality_rule_id = assessment.quality_rule_id
        WHERE rule.code = 'CLAIM_HAS_EVIDENCE'`,
      { type: QueryTypes.SELECT },
    );
    expect(sameCutoff[0]?.total).toBe('1');

    await service.evaluateAll(new Date('2026-09-17T12:00:00.000Z'));
    const twoCutoffs = await harness.database.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM quality_lineage.quality_assessment assessment
         JOIN quality_lineage.quality_rule rule
           ON rule.quality_rule_id = assessment.quality_rule_id
        WHERE rule.code = 'CLAIM_HAS_EVIDENCE'`,
      { type: QueryTypes.SELECT },
    );
    expect(twoCutoffs[0]?.total).toBe('2');
  }, 120_000);

  /** Every declared rule produces a result, including the ones with no rows. */
  it('evaluates every declared rule and stores each one with its version', async () => {
    await seedClaims(3, 3);
    const outcomes = await service.evaluateAll(new Date('2026-09-16T12:00:00.000Z'));
    expect(outcomes.length).toBeGreaterThanOrEqual(7);
    for (const outcome of outcomes) {
      expect(outcome.ruleVersion).toMatch(/^\d+\.\d+\.\d+$/u);
      expect(outcome.scope.length).toBeGreaterThan(0);
      if (outcome.denominator === 0) expect(outcome.share).toBeNull();
    }
  }, 120_000);
});
