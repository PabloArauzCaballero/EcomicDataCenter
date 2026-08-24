import { QueryTypes, type Sequelize } from 'sequelize';
import { createIntegrationDatabase, describeIntegration, truncateAll } from './database.harness';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runBootSeeds } from '../../src/database/seeds/runners/run-boot-seeds';

const SEEDS = join(__dirname, '..', '..', 'src', 'database', 'seeds', 'boot');

/**
 * Earliest day any committed snapshot claims to cover.
 *
 * Read from the directory rather than from a list written here: a list has to
 * be remembered every time the history is extended, and forgetting it breaks a
 * test that was still telling the truth.
 */
async function earliestSnapshotDay(): Promise<string> {
  const files = (await readdir(SEEDS)).filter((file) => file.startsWith('fx-parallel-history'));
  const starts = await Promise.all(
    files.map(async (file) => {
      const parsed = JSON.parse(await readFile(join(SEEDS, file), 'utf8')) as {
        provenance: { rangeStart: string };
      };
      return parsed.provenance.rangeStart;
    }),
  );
  return starts.sort()[0] ?? '';
}

/** Earliest year any committed macro snapshot claims to cover. */
async function earliestMacroPeriod(): Promise<string> {
  const files = (await readdir(SEEDS)).filter((file) => file.startsWith('macro-annual-history'));
  const periods = await Promise.all(
    files.map(async (file) => {
      const parsed = JSON.parse(await readFile(join(SEEDS, file), 'utf8')) as {
        series: Array<{ points: Array<{ period: string }> }>;
      };
      return parsed.series.flatMap((series) => series.points.map((point) => point.period)).sort()[0] ?? '';
    }),
  );
  return periods.filter(Boolean).sort()[0] ?? '';
}

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

    expect(afterFirst.observations).toBeGreaterThan(400);
    expect(afterFirst.claims).toBe(afterFirst.observations);
    expect(afterFirst.artifacts).toBeGreaterThanOrEqual(1);

    // Each backfilled series opens exactly one run, however many series exist.
    const duplicated = await count(
      `(SELECT ai_agent_id FROM intelligence.agent_run WHERE trigger_type = 'BACKFILL'
        GROUP BY ai_agent_id HAVING count(*) > 1) AS repeated`,
    );
    expect(duplicated).toBe(0);

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
    // Pinned to the snapshots rather than to a literal date, so extending the
    // history does not break a test that was still telling the truth.
    expect(row?.first_day).toBe(await earliestSnapshotDay());
  });

  it('keeps the annual macro series out of the daily models', async () => {
    await runBootSeeds();

    const [daily] = await database.query<{ total: string }>(
      `SELECT count(*) AS total FROM read_models.economic_indicator_daily
       WHERE indicator_code NOT LIKE 'FX_%'`,
      { type: QueryTypes.SELECT },
    );
    // A yearly figure on a daily axis would be charted as if it were a day.
    expect(Number(daily?.total ?? 0)).toBe(0);

    const [annual] = await database.query<{ indicators: string; first_period: string }>(
      `SELECT count(DISTINCT indicator_code) AS indicators, min(period) AS first_period
       FROM read_models.macro_indicator_annual`,
      { type: QueryTypes.SELECT },
    );
    expect(Number(annual?.indicators ?? 0)).toBeGreaterThanOrEqual(10);
    expect(annual?.first_period).toBe(await earliestMacroPeriod());
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
