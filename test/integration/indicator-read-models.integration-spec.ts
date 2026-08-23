import { QueryTypes, type Sequelize } from 'sequelize';
import { createIntegrationDatabase, describeIntegration, truncateAll } from './database.harness';
import { runBootSeeds } from '../../src/database/seeds/runners/run-boot-seeds';

/**
 * Exercises what only a real database can answer.
 *
 * A view compiles as text and can still fail on execution — `round()` over a
 * double is a valid-looking expression that does not exist — and the
 * idempotency of the historical load is a property of rows, not of code. Both
 * are invisible to a unit test and both reach production directly.
 */
describeIntegration('economic indicator read models', () => {
  let database: Sequelize;

  beforeAll(() => {
    database = createIntegrationDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await truncateAll(database);
  });

  const count = async (table: string): Promise<number> => {
    const [row] = await database.query<{ total: string }>(`SELECT count(*) AS total FROM ${table}`, {
      type: QueryTypes.SELECT,
    });
    return Number(row?.total ?? 0);
  };

  // The property under test is that the second run is a no-op, not the absolute
  // row counts: those depend on what else the harness left behind.
  it('loads the historical series and writes nothing on a second run', async () => {
    await runBootSeeds();
    const afterFirst = {
      observations: await count('intelligence.raw_observation'),
      claims: await count('intelligence.fact_claim'),
      runs: await count('intelligence.agent_run'),
      artifacts: await count('provenance.source_artifact'),
    };

    expect(afterFirst.observations).toBeGreaterThan(200);
    expect(afterFirst.claims).toBe(afterFirst.observations);
    expect(afterFirst.runs).toBe(1);
    expect(afterFirst.artifacts).toBeGreaterThanOrEqual(1);

    await runBootSeeds();

    expect({
      observations: await count('intelligence.raw_observation'),
      claims: await count('intelligence.fact_claim'),
      runs: await count('intelligence.agent_run'),
      artifacts: await count('provenance.source_artifact'),
    }).toEqual(afterFirst);
  });

  it('exposes the loaded series through the read models', async () => {
    await runBootSeeds();

    const [row] = await database.query<{
      readings: string;
      first_day: string;
      last_day: string;
    }>(
      `SELECT count(*) AS readings, min(event_date)::text AS first_day, max(event_date)::text AS last_day
       FROM read_models.economic_indicator_reading
       WHERE indicator_code = 'FX_PARALLEL_USD_BOB'`,
      { type: QueryTypes.SELECT },
    );

    // Two sides per day, so the reading count is twice the number of days.
    expect(Number(row?.readings ?? 0)).toBeGreaterThan(400);
    expect(row?.first_day).toBe('2026-01-01');
  });

  it('keeps a daily average and a point-in-time reading apart', async () => {
    await runBootSeeds();

    const rows = await database.query<{ aggregation: string }>(
      `SELECT DISTINCT aggregation
       FROM read_models.economic_indicator_daily
       WHERE indicator_code = 'FX_PARALLEL_USD_BOB'`,
      { type: QueryTypes.SELECT },
    );

    // The archive is published as a daily average; nothing may relabel it as a
    // reading taken at a moment.
    expect(rows.map((row) => row.aggregation)).toEqual(['DAILY_AVERAGE']);
  });

  it('executes the gap view, which a syntax check alone cannot prove', async () => {
    await runBootSeeds();

    await expect(
      database.query(`SELECT * FROM read_models.exchange_rate_gap LIMIT 1`, {
        type: QueryTypes.SELECT,
      }),
    ).resolves.toBeDefined();
  });
});
