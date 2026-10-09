import {
  exogenousFactorsSchema,
  factorPeriodStart,
  type FactorFrequency,
} from '../schemas/exogenous-factors.schema';
import { factorPayload, factorRevisionHash } from '../runners/exogenous-factor-payload';
import {
  exogenousFactorVersionView,
  exogenousLegacyVersionView,
  exogenousVersionGrants,
} from '../../migration-sql/0101-read-exogenous-factor-versions.view';
import { factorFixture } from './exogenous-factors.fixture';

describe('factor data contract', () => {
  it.each<[string, FactorFrequency, string | null]>([
    ['2024-02-29', 'DAILY', '2024-02-29'],
    ['2023-02-29', 'DAILY', null],
    ['2024-04-31', 'DAILY', null],
    ['2024-13', 'MONTHLY', null],
    ['2024-02', 'MONTHLY', '2024-02-01'],
    ['2024-Q4', 'QUARTERLY', '2024-10-01'],
    ['2024-Q5', 'QUARTERLY', null],
    ['2024', 'ANNUAL', '2024-01-01'],
    ['2020-W53', 'WEEKLY', '2020-12-28'],
    ['2021-W53', 'WEEKLY', null],
    ['2025-W01', 'WEEKLY', '2024-12-30'],
    ['2024-02', 'DAILY', null],
  ])('validates calendar %s at %s', (period, frequency, expected) => {
    expect(factorPeriodStart(period, frequency)).toBe(expected);
  });

  it('keeps negative and exact decimal strings without floating-point conversion', () => {
    const series = factorFixture();
    series.points[0]!.value = '-0.00000000000000001234';
    expect(
      exogenousFactorsSchema.parse({ version: 1, series: [series] }).series[0]!.points[0]!.value,
    ).toBe('-0.00000000000000001234');
    series.points[0]!.value = '1e-8';
    expect(exogenousFactorsSchema.safeParse({ version: 1, series: [series] }).success).toBe(false);
  });

  it('requires explicit null for absent or suppressed values and disallows duplicate periods', () => {
    const series = factorFixture();
    series.points[0]!.status = 'MISSING';
    expect(exogenousFactorsSchema.safeParse({ version: 1, series: [series] }).success).toBe(false);
    series.points[0]!.value = null;
    expect(exogenousFactorsSchema.safeParse({ version: 1, series: [series] }).success).toBe(true);
    series.points.push({ ...series.points[0]! });
    expect(exogenousFactorsSchema.safeParse({ version: 1, series: [series] }).success).toBe(false);
  });

  it('rejects knowledge later than acquisition and future realized periods, but permits forecasts', () => {
    const series = factorFixture();
    series.points[0]!.publishedAt = '2024-03-03T00:00:00.000Z';
    expect(exogenousFactorsSchema.safeParse({ version: 1, series: [series] }).success).toBe(false);
    series.points[0]!.publishedAt = null;
    series.points[0]!.firstSeenAt = '2024-03-03T00:00:00.000Z';
    expect(exogenousFactorsSchema.safeParse({ version: 1, series: [series] }).success).toBe(false);
    series.points[0]!.firstSeenAt = '2024-03-01T00:00:00.000Z';
    series.points[0]!.period = '2024-04';
    expect(exogenousFactorsSchema.safeParse({ version: 1, series: [series] }).success).toBe(false);
    series.observationStatus = 'FORECAST';
    expect(exogenousFactorsSchema.safeParse({ version: 1, series: [series] }).success).toBe(true);
  });

  it('rejects duplicate series and conflicting sector taxonomy', () => {
    const series = factorFixture();
    expect(exogenousFactorsSchema.safeParse({ version: 1, series: [series, series] }).success).toBe(
      false,
    );
    series.sectorIds = ['V'];
    expect(exogenousFactorsSchema.safeParse({ version: 1, series: [series] }).success).toBe(false);
  });
});

describe('immutable factor revisions', () => {
  it('ignores a new retrieval of the same revision, but preserves A → B → A', () => {
    const series = factorFixture();
    const a = series.points[0]!;
    const b = {
      ...a,
      value: '6.00',
      firstSeenAt: '2024-03-03T00:00:00.000Z',
      retrievedAt: '2024-03-03T00:00:00.000Z',
    };
    const aAgain = {
      ...a,
      firstSeenAt: '2024-03-04T00:00:00.000Z',
      retrievedAt: '2024-03-04T00:00:00.000Z',
    };
    expect(factorRevisionHash(series, { ...a, retrievedAt: '2024-03-10T00:00:00.000Z' })).toBe(
      factorRevisionHash(series, a),
    );
    expect(new Set([a, b, aAgain].map((point) => factorRevisionHash(series, point))).size).toBe(3);
    expect(factorPayload(series, a)).not.toHaveProperty('measures');
    expect(factorPayload(series, a)).not.toHaveProperty('points');
  });

  it('retains revisions to evidence and metadata, and treats sector lists as sets', () => {
    const series = factorFixture();
    series.sectorIds = ['K', 'C'];
    const point = series.points[0]!;
    const hash = factorRevisionHash(series, point);
    expect(factorRevisionHash({ ...series, sectorIds: ['C', 'K'] }, point)).toBe(hash);
    expect(factorRevisionHash(series, { ...point, upstreamSha256: 'b'.repeat(64) })).not.toBe(hash);
    expect(factorRevisionHash({ ...series, licenseStatus: 'RESTRICTED' }, point)).not.toBe(hash);
  });
});

describe('public revision view contracts', () => {
  it('retains all licensed published factor revisions and conservative availability', () => {
    expect(exogenousFactorVersionView).toContain("'licenseStatus' = 'PUBLIC_REUSE_ALLOWED'");
    expect(exogenousFactorVersionView).toContain("fc.status = 'PUBLISHED'");
    expect(exogenousFactorVersionView).toContain(
      "COALESCE((ro.payload_json ->> 'publishedAt')::timestamptz",
    );
    expect(exogenousFactorVersionView).toContain(
      "(ro.payload_json ->> 'firstSeenAt')::timestamptz",
    );
    expect(exogenousFactorVersionView).not.toMatch(/DISTINCT ON|superseded_by_claim_id|LIMIT/iu);
  });

  it('does not backdate legacy publication to its observation date or grant private table access', () => {
    expect(exogenousLegacyVersionView).toContain('ro.received_at AS available_at');
    expect(exogenousLegacyVersionView).not.toMatch(
      /event_date|superseded_by_claim_id|DISTINCT ON/iu,
    );
    expect(exogenousVersionGrants).toContain('backend_reader');
    expect(exogenousVersionGrants).not.toContain('GRANT SELECT ON intelligence');
  });
});
