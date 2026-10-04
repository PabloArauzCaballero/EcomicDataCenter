import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { QueryTypes, Sequelize } from 'sequelize';
import { up, down } from '../../src/database/migrations/0102-read-exogenous-factor-versions';
import { factorPayload, factorRevisionHash } from '../../src/database/seeds/runners/exogenous-factor-payload';
import { factorFixture } from '../../src/database/seeds/tests/exogenous-factors.fixture';
import type { ExogenousFactorPoint, ExogenousFactorSeries } from '../../src/database/seeds/schemas/exogenous-factors.schema';

/** Explicit opt-in. Never consumes DATABASE_URL, INTEGRATION_DATABASE_URL or .env. */
const isolated = process.env.RUN_EXOGENOUS_DOCKER_TEST === '1' ? describe : describe.skip;

isolated('exogenous factor versions on disposable PostgreSQL 17', () => {
  let database: Sequelize | undefined;
  let containerId: string | undefined;
  const name = `observatorio-exogenous-test-${randomBytes(6).toString('hex')}`;
  const artifactId = randomUUID();

  function docker(args: string[], password?: string): string {
    return execFileSync('docker', args, {
      encoding: 'utf8', timeout: 60_000,
      env: password ? { ...process.env, POSTGRES_PASSWORD: password } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  async function cleanup(): Promise<void> {
    try {
      await database?.close();
    } finally {
      database = undefined;
      if (containerId) {
        docker(['rm', '--force', containerId]);
        containerId = undefined;
      }
    }
  }

  beforeAll(async () => {
    const password = randomBytes(24).toString('hex');
    try {
      containerId = docker(['run', '--detach', '--rm', '--name', name, '--publish', '127.0.0.1::5432',
        '--env', 'POSTGRES_PASSWORD', 'postgres:17.5-alpine'], password);
      const port = Number(docker(['port', containerId, '5432/tcp']).split(':').at(-1));
      database = new Sequelize('postgres', 'postgres', password, {
        dialect: 'postgres', host: '127.0.0.1', port, logging: false,
        pool: { max: 2, min: 0, acquire: 2_000, idle: 1_000 },
      });
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        try { await database.authenticate(); ready = true; break; }
        catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
      }
      if (!ready) throw new Error('Disposable PostgreSQL did not become ready');
      await database.query(`
        CREATE SCHEMA intelligence; CREATE SCHEMA provenance; CREATE SCHEMA read_models;
        CREATE ROLE backend_reader NOLOGIN;
        GRANT USAGE ON SCHEMA read_models TO backend_reader;
        CREATE TABLE provenance.source_artifact (source_artifact_id uuid PRIMARY KEY, original_uri text, sha256 char(64));
        CREATE TABLE intelligence.raw_observation (
          raw_observation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          source_artifact_id uuid REFERENCES provenance.source_artifact,
          payload_json jsonb NOT NULL, payload_hash char(64) NOT NULL, received_at timestamptz NOT NULL
        );
        CREATE TABLE intelligence.fact_claim (
          fact_claim_id uuid PRIMARY KEY, raw_observation_id bigint REFERENCES intelligence.raw_observation,
          status text NOT NULL, superseded_by_claim_id uuid, event_date date
        );
        CREATE TABLE intelligence.claim_evidence (fact_claim_id uuid REFERENCES intelligence.fact_claim, excerpt text);
      `);
      await database.query('INSERT INTO provenance.source_artifact VALUES (:id, :url, :hash)', {
        replacements: { id: artifactId, url: 'https://example.org/data.csv', hash: 'a'.repeat(64) },
      });
      await up({ context: { sequelize: database } });
    } catch (error) {
      await cleanup();
      throw error;
    }
  }, 90_000);

  afterAll(cleanup, 30_000);

  async function insert(payload: Record<string, unknown>, hash: string, received: string, status = 'PUBLISHED'): Promise<string> {
    const records = await database!.query<{ id: string }>(
      `INSERT INTO intelligence.raw_observation (source_artifact_id,payload_json,payload_hash,received_at)
       VALUES (:artifact,CAST(:payload AS jsonb),:hash,CAST(:received AS timestamptz)) RETURNING raw_observation_id::text AS id`,
      { type: QueryTypes.SELECT, replacements: { artifact: artifactId, payload: JSON.stringify(payload), hash, received } },
    );
    const id = records[0]!.id;
    await database!.query('INSERT INTO intelligence.fact_claim VALUES (:claim,:id,:status,NULL,DATE \'2000-01-01\')', {
      replacements: { claim: randomUUID(), id, status },
    });
    return id;
  }

  async function insertFactor(series: ExogenousFactorSeries, point: ExogenousFactorPoint, status?: string): Promise<string> {
    return insert(factorPayload(series, point), factorRevisionHash(series, point), point.retrievedAt, status);
  }

  async function asOf(code: string, cutoff: string): Promise<Array<{ value: string | null }>> {
    return database!.query<{ value: string | null }>(`
      SELECT DISTINCT ON (code,period) value::text AS value
      FROM read_models.exogenous_factor_version
      WHERE code=:code AND available_at <= CAST(:cutoff AS timestamptz)
      ORDER BY code,period,available_at DESC,received_at DESC,raw_observation_id DESC`,
    { type: QueryTypes.SELECT, replacements: { code, cutoff } });
  }

  it('preserves A → B → A, applies availability before ranking, and does not duplicate multiple claims', async () => {
    const series = factorFixture();
    const a = { ...series.points[0]!, publishedAt: '2024-03-02T00:00:00.000Z', firstSeenAt: '2024-03-03T00:00:00.000Z', retrievedAt: '2024-03-03T00:00:00.000Z' };
    const b = { ...a, value: '6.00', publishedAt: '2024-03-05T00:00:00.000Z', firstSeenAt: '2024-03-05T00:00:00.000Z', retrievedAt: '2024-03-05T00:00:00.000Z' };
    const aAgain = { ...a, publishedAt: '2024-03-07T00:00:00.000Z', firstSeenAt: '2024-03-07T00:00:00.000Z', retrievedAt: '2024-03-07T00:00:00.000Z' };
    const id = await insertFactor(series, a);
    await insertFactor(series, b);
    await insertFactor(series, aAgain);
    await database!.query('INSERT INTO intelligence.fact_claim VALUES (:claim,:id,\'PUBLISHED\',NULL,NULL)', { replacements: { claim: randomUUID(), id } });
    expect(await asOf(series.code, '2024-03-01T23:59:59Z')).toEqual([]);
    expect(await asOf(series.code, '2024-03-02T00:00:00Z')).toEqual([{ value: '5.25' }]);
    expect(await asOf(series.code, '2024-03-06T00:00:00Z')).toEqual([{ value: '6.00' }]);
    expect(await asOf(series.code, '2024-03-08T00:00:00Z')).toEqual([{ value: '5.25' }]);
    const count = await database!.query<{ total: string }>('SELECT count(*)::text AS total FROM read_models.exogenous_factor_version', { type: QueryTypes.SELECT });
    expect(count[0]!.total).toBe('3');
  });

  it('uses firstSeenAt when publication is unknown and retains null suppression', async () => {
    const series = { ...factorFixture(), code: 'FACTOR_UNKNOWN_DATE' };
    await insertFactor(series, { ...series.points[0]!, value: null, status: 'SUPPRESSED' });
    expect(await asOf(series.code, '2024-02-29T23:59:59Z')).toEqual([]);
    expect(await asOf(series.code, '2024-03-01T00:00:00Z')).toEqual([{ value: null }]);
  });

  it('excludes unreviewed/restricted licenses and unpublished claims independently', async () => {
    for (const licenseStatus of ['PENDING_REVIEW', 'RESTRICTED'] as const) {
      const series = { ...factorFixture(), code: `FACTOR_${licenseStatus}`, licenseStatus };
      await insertFactor(series, series.points[0]!);
      expect(await asOf(series.code, '2024-12-31T00:00:00Z')).toEqual([]);
    }
    const series = { ...factorFixture(), code: 'FACTOR_UNPUBLISHED' };
    await insertFactor(series, series.points[0]!, 'PENDING_REVIEW');
    expect(await asOf(series.code, '2024-12-31T00:00:00Z')).toEqual([]);
  });

  it.each(['PENDING_REVIEW', 'RESTRICTED'] as const)('withdraws every vintage under current %s permission and restores only public published revisions', async (licenseStatus) => {
    const series = { ...factorFixture(), code: `FACTOR_LICENSE_POLICY_${licenseStatus}` };
    const original = series.points[0]!;
    await insertFactor(series, { ...original, period: '2024-01', value: '4.00' });
    await insertFactor(series, original);
    expect(await asOf(series.code, '2024-03-10T00:00:00Z')).toHaveLength(2);

    // New authority can be attached to any observed period, not just the newest period.
    const authorityPoint = { ...original, period: '2024-01',
      firstSeenAt: '2024-04-01T00:00:00.000Z', retrievedAt: '2024-04-01T00:00:00.000Z' };
    await insertFactor({ ...series, licenseStatus }, authorityPoint, 'PENDING_REVIEW');
    expect(await asOf(series.code, '2024-03-10T00:00:00Z')).toEqual([]);
    expect(await asOf(series.code, '2024-12-31T00:00:00Z')).toEqual([]);

    // A later insertion of an older public acquisition must not override current authority.
    await insertFactor(series, { ...original, period: '2023-12', value: '3.00',
      retrievedAt: '2024-03-03T00:00:00.000Z' });
    expect(await asOf(series.code, '2024-12-31T00:00:00Z')).toEqual([]);
    const rawCount = await database!.query<{ total: string }>(
      "SELECT count(*)::text AS total FROM intelligence.raw_observation WHERE payload_json->>'code'=:code",
      { type: QueryTypes.SELECT, replacements: { code: series.code } });
    expect(rawCount[0]!.total).toBe('4');

    // Equal acquisition timestamps resolve by raw identity, making restoration deterministic.
    await insertFactor(series, authorityPoint);
    expect(await asOf(series.code, '2024-03-10T00:00:00Z')).toEqual([
      { value: '3.00' }, { value: '4.00' }, { value: '5.25' },
    ]);
    const visible = await database!.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM read_models.exogenous_factor_version WHERE code=:code',
      { type: QueryTypes.SELECT, replacements: { code: series.code } });
    expect(visible[0]!.total).toBe('4');
  });

  it('retains legacy vintages using receipt, never the observation/event date', async () => {
    await insert({ dataCategory: 'EXOGENOUS_PRICE', indicatorCode: 'EXO_TEST', period: '2000-01', value: '10' }, 'b'.repeat(64), '2024-03-01T00:00:00Z');
    await insert({ dataCategory: 'EXOGENOUS_PRICE', indicatorCode: 'EXO_TEST', period: '2000-01', value: '11' }, 'c'.repeat(64), '2024-03-05T00:00:00Z');
    const rows = await database!.query<{ value: string; available_at: Date; source_url: string }>(
      'SELECT value::text,available_at,source_url FROM read_models.exogenous_legacy_version ORDER BY available_at', { type: QueryTypes.SELECT });
    expect(rows.map((row) => row.value)).toEqual(['10', '11']);
    expect(rows[0]!.available_at.toISOString()).toBe('2024-03-01T00:00:00.000Z');
    expect(rows[0]!.source_url).toBe('https://example.org/data.csv');
  });

  it('excludes future and impossible legacy periods while retaining valid leap days and period starts', async () => {
    const periods = ['2024-03-03', '2024-04', '2025', '2023-02-29', '2024-02-30', '2024-13', '2024-01-32', '0000', '2024-02-29', '2024-03', '2024'];
    for (const [index, period] of periods.entries()) {
      await insert({ dataCategory: 'EXOGENOUS_PRICE', indicatorCode: 'EXO_CALENDAR', period, value: '1' },
        index.toString(16).padStart(64, '0'), '2024-03-02T23:00:00Z');
    }
    const rows = await database!.query<{ period: string }>(
      "SELECT period FROM read_models.exogenous_legacy_version WHERE code='EXO_CALENDAR' ORDER BY period", { type: QueryTypes.SELECT });
    expect(rows.map((row) => row.period)).toEqual(['2024', '2024-02-29', '2024-03']);
  });

  it('allows backend_reader to read views without granting raw private tables', async () => {
    await database!.transaction(async (transaction) => {
      await database!.query('SET LOCAL ROLE backend_reader', { transaction });
      const rows = await database!.query<{ total: string }>('SELECT count(*)::text AS total FROM read_models.exogenous_factor_version', { type: QueryTypes.SELECT, transaction });
      expect(Number(rows[0]!.total)).toBeGreaterThan(0);
    });
    const rights = await database!.query<{ permitted: boolean }>("SELECT has_table_privilege('backend_reader','intelligence.raw_observation','SELECT') AS permitted", { type: QueryTypes.SELECT });
    expect(rights[0]!.permitted).toBe(false);
  });

  it('rolls down and up without changing immutable underlying observations', async () => {
    const before = await database!.query<{ total: string }>('SELECT count(*)::text AS total FROM intelligence.raw_observation', { type: QueryTypes.SELECT });
    await down({ context: { sequelize: database! } });
    const absent = await database!.query<{ view_name: string | null }>("SELECT to_regclass('read_models.exogenous_factor_version')::text AS view_name", { type: QueryTypes.SELECT });
    expect(absent[0]!.view_name).toBeNull();
    await up({ context: { sequelize: database! } });
    const after = await database!.query<{ total: string }>('SELECT count(*)::text AS total FROM intelligence.raw_observation', { type: QueryTypes.SELECT });
    expect(after).toEqual(before);
  });
});
