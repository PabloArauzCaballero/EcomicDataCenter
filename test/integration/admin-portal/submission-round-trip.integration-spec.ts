import { randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { QueryTypes } from 'sequelize';
import { ENVIRONMENT } from '../../../src/config/configuration.module';
import type { Environment } from '../../../src/config/environment';
import { IngestionStatusService } from '../../../src/modules/admin/ingestion-status.service';
import {
  describeIntegration,
  startAdminHarness,
  truncateOperations,
  type AdminHarness,
} from './harness';

/**
 * ING-01: a valid submission travels the whole way and is visible where an
 * operator looks.
 *
 * The cycle is driven over HTTP — open, submit, close — so the stage register
 * is written by the services the collectors actually call, not by the test.
 * What is asserted is not that the request returned 200: it is that the
 * observation exists, that each stage this path passed through left a row of
 * its own, that no stage claims one it did not reach, and that the console's
 * own reader reports the same thing for that run.
 *
 * A collector's output is untrusted input, so what arrives is a claim awaiting
 * review, never an authoritative observation. The assertions say so.
 */
const AGENT_CODE = 'IT-ROUND-TRIP';

interface StageRow {
  stage: string;
  outcome: string;
  records_received: string;
  records_accepted: string;
}

describeIntegration('submission round trip', () => {
  let harness: AdminHarness;
  let app: NestFastifyApplication;
  let ingestion: IngestionStatusService;
  let prefix: string;
  let artifactId: string;

  beforeAll(async () => {
    harness = await startAdminHarness();
    ingestion = harness.module.get(IngestionStatusService);
    app = harness.module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    const environment = harness.module.get<Environment>(ENVIRONMENT);
    prefix = `/${environment.API_PREFIX}/${environment.API_VERSION}`;
    app.setGlobalPrefix(`${environment.API_PREFIX}/${environment.API_VERSION}`);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    artifactId = await anArtifact();
    await registerAgent();
  }, 180_000);

  afterAll(async () => {
    if (app) await app.close();
    if (harness) await harness.close();
  });

  beforeEach(async () => {
    await truncateOperations(harness.database);
  });

  /** Any artifact already on the record: evidence has to point at something real. */
  async function anArtifact(): Promise<string> {
    const rows = await harness.database.query<{ source_artifact_id: string }>(
      'SELECT source_artifact_id FROM provenance.source_artifact ORDER BY retrieved_at DESC LIMIT 1',
      { type: QueryTypes.SELECT },
    );
    const identifier = rows[0]?.source_artifact_id;
    if (!identifier) throw new Error('the database holds no source artifact to cite');
    return identifier;
  }

  /** Registers this suite's collector through the same endpoint an operator uses. */
  async function registerAgent(): Promise<void> {
    const organizations = await harness.database.query<{ organization_id: string }>(
      'SELECT organization_id FROM provenance.organization ORDER BY organization_id LIMIT 1',
      { type: QueryTypes.SELECT },
    );
    const organizationId = organizations[0]?.organization_id;
    if (!organizationId) throw new Error('no organization exists to own the collector');
    const response = await app.inject({
      method: 'POST',
      url: `${prefix}/intelligence/agents`,
      payload: {
        code: AGENT_CODE,
        name: 'Colector de ida y vuelta',
        agentType: 'EXCHANGE_RATE',
        provider: 'integration',
        modelIdentifier: 'none',
        promptVersion: 'v1',
        schemaVersion: 'v1',
        organizationId,
        configuration: {},
      },
    });
    if (![200, 201, 409].includes(response.statusCode)) {
      throw new Error(`the collector was not registered: ${response.statusCode} ${response.body}`);
    }
  }

  it('carries a valid submission from the API to the console, stage by stage', async () => {
    const submissionCode = `IT-RT-${randomUUID().slice(0, 8).toUpperCase()}`;
    const response = await app.inject({
      method: 'POST',
      url: `${prefix}/intelligence/daily-analysis`,
      payload: {
        agent: {
          agentCode: AGENT_CODE,
          triggerType: 'MANUAL',
          attemptNo: 1,
          promptVersion: 'v1',
          schemaVersion: 'v1',
        },
        submission: {
          submissionCode,
          items: [
            {
              /*
               * The payload carries this run's code because the pipeline
               * fingerprints the raw payload and turns a repeat into a
               * duplicate. That deduplication is what ING-03 covers; here it
               * would only make the second execution of this case assert
               * nothing at all.
               */
              rawPayload: {
                fuente: 'boletín',
                valor: '6.96',
                unidad: 'BOB/USD',
                envio: submissionCode,
              },
              claim: {
                claimType: 'FACT',
                assertion: `El tipo de cambio oficial se mantuvo en 6,96 bolivianos por dólar durante la jornada (${submissionCode}).`,
                eventDate: '2026-09-15',
                confidenceLevel: 'HIGH',
                entityMentions: ['Banco Central de Bolivia'],
                evidence: [
                  {
                    sourceArtifactId: artifactId,
                    excerpt:
                      'El tipo de cambio oficial de venta se mantuvo sin variación respecto a la jornada anterior.',
                    retrievedAt: new Date().toISOString(),
                  },
                ],
              },
            },
          ],
        },
        completion: { status: 'SUCCEEDED', sourcesConsulted: 1, warningCount: 0 },
      },
    });
    expect([200, 201]).toContain(response.statusCode);

    const body = response.json() as { agentRunId?: string; runId?: string };
    const runId = body.agentRunId ?? body.runId;
    expect(runId).toBeTruthy();

    // The observation exists, and it exists as something awaiting review rather
    // than as an authoritative figure: an agent cannot publish by submitting.
    const observations = await harness.database.query<{ total: string; statuses: string }>(
      `SELECT count(*)::text AS total, string_agg(DISTINCT processing_status, ',') AS statuses
         FROM intelligence.raw_observation WHERE agent_run_id = :runId`,
      { type: QueryTypes.SELECT, replacements: { runId } },
    );
    expect(Number(observations[0]?.total)).toBe(1);
    expect(observations[0]?.statuses).not.toContain('PUBLISHED');

    // Every stage the cycle passed through left a row of its own.
    const stages = await harness.database.query<StageRow>(
      `SELECT stage, outcome, records_received::text AS records_received,
              records_accepted::text AS records_accepted
         FROM operations.ingestion_event WHERE agent_run_id = :runId ORDER BY occurred_at`,
      { type: QueryTypes.SELECT, replacements: { runId } },
    );
    expect(stages.map((stage) => stage.stage).sort()).toEqual(['COLLECTION', 'DELIVERY']);
    const delivery = stages.find((stage) => stage.stage === 'DELIVERY');
    expect(delivery?.outcome).toBe('SUCCEEDED');
    expect(Number(delivery?.records_received)).toBe(1);
    expect(Number(delivery?.records_accepted)).toBe(1);

    /*
     * And no stage claims persistence, because this path did not persist
     * anything into the official series. Delivery is the collector handing over
     * a claim; turning that claim into a figure is review's decision and the
     * importer's write, and the console must not let one be read as the other.
     */
    expect(stages.map((stage) => stage.stage)).not.toContain('PERSISTENCE');

    // The console's own reader reports the same stages for that run, which is
    // the screen an operator actually opens.
    const detail = await ingestion.describeRun(runId as string);
    expect(detail.stagesRecorded).toBe(true);
    expect(detail.stages.map((stage) => stage.stage).sort()).toEqual(['COLLECTION', 'DELIVERY']);
    expect(detail.counters.received).toBeGreaterThanOrEqual(1);
    expect(detail.status).toBe('SUCCEEDED');
  }, 180_000);

  it('refuses a submission whose claim cites no evidence and records nothing', async () => {
    const before = await harness.database.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM intelligence.raw_observation',
      { type: QueryTypes.SELECT },
    );
    const response = await app.inject({
      method: 'POST',
      url: `${prefix}/intelligence/daily-analysis`,
      payload: {
        agent: {
          agentCode: AGENT_CODE,
          triggerType: 'MANUAL',
          attemptNo: 1,
          promptVersion: 'v1',
          schemaVersion: 'v1',
        },
        submission: {
          submissionCode: `IT-RT-${randomUUID().slice(0, 8).toUpperCase()}`,
          items: [
            {
              rawPayload: { valor: '6.96' },
              claim: {
                claimType: 'FACT',
                assertion: 'Una afirmación sin ninguna evidencia que la sostenga en absoluto.',
                confidenceLevel: 'HIGH',
                evidence: [],
              },
            },
          ],
        },
        completion: { status: 'SUCCEEDED', sourcesConsulted: 1, warningCount: 0 },
      },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);

    const after = await harness.database.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM intelligence.raw_observation',
      { type: QueryTypes.SELECT },
    );
    expect(after[0]?.total).toBe(before[0]?.total);
  }, 180_000);
});
