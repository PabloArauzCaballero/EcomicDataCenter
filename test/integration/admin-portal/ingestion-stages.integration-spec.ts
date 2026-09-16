import { QueryTypes } from 'sequelize';
import { IngestionEventRecorder } from '../../../src/common/observability/ingestion-event.recorder';
import { IngestionStatusService } from '../../../src/modules/admin/ingestion-status.service';
import {
  describeIntegration,
  startAdminHarness,
  truncateOperations,
  type AdminHarness,
} from './harness';

/**
 * ING-02, ING-06 and ING-08: the three shapes a run takes that a single
 * «correcta» would erase.
 *
 * A collection that never reached delivery, a run whose counters do not add up,
 * and a run that found nothing are reported as three different things here, and
 * each is built by writing the stages the collectors write, through the
 * recorder the application itself uses. A fixture that inserted the rows
 * directly would prove the query works and say nothing about whether anything
 * ever produces those rows.
 */

/**
 * The collector these runs belong to, created by this suite.
 *
 * Borrowing an identifier from the seeded catalogue would tie these cases to
 * whatever the last suite left in it, and the packages that own the collectors
 * replace them. A run needs an agent; whose agent it is says nothing about the
 * stages being tested.
 */
const AGENT_CODE = 'IT-STAGE-AGENT';

interface Counters {
  received: number;
  accepted: number;
  rejected: number;
  quarantined: number;
}

describeIntegration('ingestion stages', () => {
  let harness: AdminHarness;
  let ingestion: IngestionStatusService;
  let recorder: IngestionEventRecorder;
  let agentId: string;

  beforeAll(async () => {
    harness = await startAdminHarness();
    ingestion = harness.module.get(IngestionStatusService);
    recorder = harness.module.get(IngestionEventRecorder);
    agentId = await ensureAgent();
  }, 120_000);

  /** Creates this suite's collector, reusing it if a previous run left it. */
  async function ensureAgent(): Promise<string> {
    const existing = await harness.database.query<{ ai_agent_id: string }>(
      'SELECT ai_agent_id FROM intelligence.ai_agent WHERE code = :code',
      { type: QueryTypes.SELECT, replacements: { code: AGENT_CODE } },
    );
    const found = existing[0]?.ai_agent_id;
    if (found) return found;
    const created = await harness.database.query<{ ai_agent_id: string }>(
      `INSERT INTO intelligence.ai_agent (
         ai_agent_id, organization_id, code, name, agent_type, provider, model_identifier,
         prompt_version, schema_version, configuration_json, status, is_active
       )
       SELECT gen_random_uuid(), organization.organization_id, :code, 'Colector de pruebas',
              'EXCHANGE_RATE', 'integration', 'none', 'v1', 'v1', '{}'::jsonb, 'ACTIVE', true
         FROM provenance.organization organization
        ORDER BY organization.organization_id
        LIMIT 1
       RETURNING ai_agent_id`,
      { type: QueryTypes.SELECT, replacements: { code: AGENT_CODE } },
    );
    const identifier = created[0]?.ai_agent_id;
    if (!identifier) throw new Error('no organization exists to own the test collector');
    return identifier;
  }

  afterAll(async () => {
    if (harness) await harness.close();
  });

  beforeEach(async () => {
    await truncateOperations(harness.database);
    await harness.database.query(
      "DELETE FROM intelligence.agent_run WHERE correlation_id LIKE 'it-stage-%'",
    );
  });

  /** Opens a real run row, the way the collector does, and returns its identifier. */
  async function openRun(
    correlationId: string,
    counters: Counters,
    status: string,
    sourcesConsulted = 1,
  ): Promise<string> {
    const rows = await harness.database.query<{ agent_run_id: string }>(
      `INSERT INTO intelligence.agent_run (
         agent_run_id, ai_agent_id, correlation_id, trigger_type, attempt_no, status,
         started_at, completed_at, sources_consulted, records_received, records_accepted,
         records_rejected, records_quarantined, warning_count, prompt_version, schema_version
       ) VALUES (
         gen_random_uuid(), :agent, :correlationId, 'SCHEDULED', 1, :status,
         now() - interval '10 minutes', now(), :sourcesConsulted, :received, :accepted,
         :rejected, :quarantined, 0, 'v1', 'v1'
       ) RETURNING agent_run_id`,
      {
        type: QueryTypes.SELECT,
        replacements: { agent: agentId, correlationId, status, sourcesConsulted, ...counters },
      },
    );
    const identifier = rows[0]?.agent_run_id;
    if (!identifier) throw new Error('the run was not opened');
    return identifier;
  }

  /** ING-02: collected and never delivered is not a completed ingestion. */
  it('reports a collection that never reached delivery as a run with an open stage', async () => {
    const runId = await openRun(
      'it-stage-delivery',
      { received: 40, accepted: 40, rejected: 0, quarantined: 0 },
      'PARTIAL',
    );
    await recorder.record({
      correlationId: 'it-stage-delivery',
      agentRunId: runId,
      stage: 'COLLECTION',
      outcome: 'SUCCEEDED',
      recordsReceived: 40,
      artifactReference: 'https://example.invalid/boletin.pdf',
    });
    await recorder.record({
      correlationId: 'it-stage-delivery',
      agentRunId: runId,
      stage: 'DELIVERY',
      outcome: 'FAILED',
      reason: 'el destino rechazó el envío',
    });

    const detail = await ingestion.describeRun(runId);
    expect(detail.stagesRecorded).toBe(true);
    expect(detail.stages.map((stage) => [stage.stage, stage.outcome])).toEqual(
      expect.arrayContaining([
        ['COLLECTION', 'SUCCEEDED'],
        ['DELIVERY', 'FAILED'],
      ]),
    );
    // Nothing was persisted, so no stage claims it was.
    expect(detail.stages.some((stage) => stage.stage === 'PERSISTENCE')).toBe(false);
    expect(detail.stages.find((stage) => stage.outcome === 'FAILED')?.reason).toBe(
      'el destino rechazó el envío',
    );

    // And the list agrees: the run carries one stage an operator is waiting on.
    const page = await ingestion.listRuns({ pageSize: 20 } as never);
    expect(page.items.find((item) => item.agentRunId === runId)?.stagesWithProblems).toBe(1);
  }, 120_000);

  /** ING-06: a partial run states what it has not resolved either way. */
  it('reconciles the counters of a partial run and names what is unresolved', async () => {
    const runId = await openRun(
      'it-stage-partial',
      { received: 100, accepted: 60, rejected: 10, quarantined: 5 },
      'PARTIAL',
    );
    await recorder.record({
      correlationId: 'it-stage-partial',
      agentRunId: runId,
      stage: 'VALIDATION',
      outcome: 'PARTIAL',
      recordsReceived: 100,
      recordsAccepted: 60,
      recordsRejected: 10,
      recordsSkipped: 5,
      reason: 'veinticinco registros quedaron sin resolver',
    });

    const detail = await ingestion.describeRun(runId);
    expect(detail.counters).toEqual({
      received: 100,
      accepted: 60,
      rejected: 10,
      quarantined: 5,
      unresolved: 25,
    });
    // The subtraction is the run's own arithmetic, not a second stored figure
    // that could drift away from the three it is derived from.
    const { received, accepted, rejected, quarantined, unresolved } = detail.counters;
    expect(accepted + rejected + quarantined + unresolved).toBe(received);

    const stage = detail.stages.find((entry) => entry.stage === 'VALIDATION');
    expect(stage?.outcome).toBe('PARTIAL');
    expect(stage?.counters).toEqual({ received: 100, accepted: 60, rejected: 10, skipped: 5 });
  }, 120_000);

  /** ING-08: nothing new is an outcome, not the absence of one. */
  it('records a run that found nothing as no changes, with its reason', async () => {
    const runId = await openRun(
      'it-stage-quiet',
      { received: 0, accepted: 0, rejected: 0, quarantined: 0 },
      'SUCCEEDED',
      0,
    );
    await recorder.record({
      correlationId: 'it-stage-quiet',
      agentRunId: runId,
      stage: 'COLLECTION',
      outcome: 'NO_CHANGES',
      reason: 'la fuente no publicó nada desde la última lectura',
    });

    const detail = await ingestion.describeRun(runId);
    expect(detail.stagesRecorded).toBe(true);
    expect(detail.stages).toHaveLength(1);
    expect(detail.stages[0]?.outcome).toBe('NO_CHANGES');
    expect(detail.stages[0]?.reason).toBe('la fuente no publicó nada desde la última lectura');
    expect(detail.counters.unresolved).toBe(0);

    // Nothing new is not a stage to wait on, so it is not counted as one.
    const page = await ingestion.listRuns({ pageSize: 20 } as never);
    expect(page.items.find((item) => item.agentRunId === runId)?.stagesWithProblems).toBe(0);
  }, 120_000);

  /** A run from before the register existed says so instead of showing silence. */
  it('distinguishes a run with no recorded stages from a run that did nothing', async () => {
    const runId = await openRun(
      'it-stage-silent',
      { received: 7, accepted: 7, rejected: 0, quarantined: 0 },
      'SUCCEEDED',
    );
    const detail = await ingestion.describeRun(runId);
    expect(detail.stages).toHaveLength(0);
    expect(detail.stagesRecorded).toBe(false);
    expect(detail.counters.received).toBe(7);
  }, 120_000);
});
