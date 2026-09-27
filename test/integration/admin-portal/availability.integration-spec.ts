import { QueryTypes } from 'sequelize';
import { HealthProbeRepository } from '../../../src/modules/admin/health-probe.repository';
import { SiteAvailabilityService } from '../../../src/modules/admin/site-availability.service';
import { describeIntegration, startAdminHarness, truncateOperations, type AdminHarness } from './harness';

/**
 * HLT-01 to HLT-03: one incident per outage, and silence that stays silent.
 *
 * The thresholds are read back from the register rather than kept in memory, so
 * these cases also cover the restart: a process that dies mid-outage must not
 * start counting again. `UNKNOWN` neither opens nor closes anything, because a
 * monitor that could not run has not observed a site that is fine.
 */
const TARGET = 'public-site';

interface IncidentRow {
  health_incident_id: string;
  status: string;
  consecutive_failures: number;
  closed_at: Date | null;
}

describeIntegration('site availability', () => {
  let harness: AdminHarness;
  let availability: SiteAvailabilityService;
  let probes: HealthProbeRepository;

  beforeAll(async () => {
    harness = await startAdminHarness({
      HEALTH_MONITOR_FAILURE_THRESHOLD: '3',
      HEALTH_MONITOR_RECOVERY_THRESHOLD: '2',
    });
    availability = harness.module.get(SiteAvailabilityService);
    probes = harness.module.get(HealthProbeRepository);
  }, 120_000);

  afterAll(async () => {
    if (harness) await harness.close();
  });

  beforeEach(async () => {
    await truncateOperations(harness.database);
  });

  const down = (reason = 'HTTP 502') =>
    availability.recordAndEvaluate({
      target: TARGET,
      probeType: 'HTTP',
      outcome: 'DOWN',
      durationMs: 12,
      evidence: { status: 502 },
      errorSummary: reason,
    });

  const up = () =>
    availability.recordAndEvaluate({
      target: TARGET,
      probeType: 'HTTP',
      outcome: 'UP',
      durationMs: 11,
      evidence: { status: 200 },
      errorSummary: null,
    });

  const unknown = () =>
    availability.recordAndEvaluate({
      target: TARGET,
      probeType: 'HTTP',
      outcome: 'UNKNOWN',
      durationMs: null,
      evidence: null,
      errorSummary: 'el monitor no pudo ejecutarse',
    });

  async function incidents(): Promise<IncidentRow[]> {
    return harness.database.query<IncidentRow>(
      `SELECT health_incident_id, status, consecutive_failures, closed_at
         FROM operations.health_incident ORDER BY opened_at`,
      { type: QueryTypes.SELECT },
    );
  }

  /** HLT-01: three consecutive failures open one incident, and only one. */
  it('opens a single incident after the third consecutive failure', async () => {
    expect((await down()).incidentOpened).toBe(false);
    expect((await down()).incidentOpened).toBe(false);
    const third = await down();
    expect(third.incidentOpened).toBe(true);

    // A fourth failure does not open a second incident.
    const fourth = await down();
    expect(fourth.incidentOpened).toBe(false);

    const open = await incidents();
    expect(open).toHaveLength(1);
    expect(open[0]?.status).toBe('OPEN');
    expect(open[0]?.consecutive_failures).toBeGreaterThanOrEqual(3);

    // And the announcement is recorded once, not once per probe.
    const deliveries = await harness.database.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM operations.alert_delivery
        WHERE dedup_key LIKE '%:opened'`,
      { type: QueryTypes.SELECT },
    );
    expect(deliveries[0]?.total).toBe('1');
  }, 120_000);

  /** HLT-02: two successes close it, and the duration is on the record. */
  it('closes the incident after two consecutive successes and records its duration', async () => {
    await down();
    await down();
    await down();
    expect((await up()).incidentClosed).toBe(false);
    const closed = await up();
    expect(closed.incidentClosed).toBe(true);

    const rows = await incidents();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('CLOSED');
    expect(rows[0]?.closed_at).not.toBeNull();
  }, 120_000);

  /**
   * HLT-03: a monitor that could not run is not a site that is fine.
   *
   * `UNKNOWN` interrupts the run of failures, so it does not open an incident —
   * and it does not close one either, because it is not evidence of recovery.
   */
  it('never opens or closes an incident on an unknown outcome', async () => {
    await down();
    await down();
    // Two failures and then no evidence: the run is interrupted, not completed.
    expect((await unknown()).incidentOpened).toBe(false);
    await down();
    expect(await incidents()).toHaveLength(0);

    // The run has to build up again from the interruption: the outcome window
    // still holds the UNKNOWN, so it takes two more failures, not one.
    expect((await down()).incidentOpened).toBe(false);
    expect((await down()).incidentOpened).toBe(true);

    // And no evidence does not close what three failures opened.
    expect((await unknown()).incidentClosed).toBe(false);
    const open = await incidents();
    expect(open).toHaveLength(1);
    expect(open[0]?.status).toBe('OPEN');
  }, 120_000);

  /** The probes themselves are on the record, whatever the decision was. */
  it('records every probe, including the ones that decided nothing', async () => {
    await down();
    await unknown();
    await up();
    const recorded = await probes.recentOutcomes(TARGET, 10);
    expect(recorded).toEqual(['UP', 'UNKNOWN', 'DOWN']);
  }, 120_000);
});
