import type { ExogenousFactorSeries } from '../schemas/exogenous-factors.schema';

export function factorFixture(): ExogenousFactorSeries {
  return {
    code: 'FACTOR_TEST',
    familyIds: ['MF_SOFR'],
    sectorIds: ['K'],
    name: 'Reference rate',
    measureType: 'RATE',
    unit: '% annual',
    frequency: 'MONTHLY',
    geography: 'United States',
    market: 'Reference market',
    publisher: 'Test publisher',
    sourceUrl: 'https://example.org/data',
    sourceSeriesKey: 'TEST_RATE',
    note: 'Unit-test fixture, never public seed data.',
    economicRole: 'EXTERNAL_DRIVER',
    targetScope: 'Financing cost in Bolivia',
    observationStatus: 'OBSERVED',
    measurementStatus: 'DIRECT',
    transformationType: 'ORIGINAL',
    licenseStatus: 'PUBLIC_REUSE_ALLOWED',
    freshnessDays: 45,
    points: [
      {
        period: '2024-02',
        value: '5.25',
        status: 'OBSERVED',
        publishedAt: null,
        firstSeenAt: '2024-03-01T00:00:00.000Z',
        retrievedAt: '2024-03-02T00:00:00.000Z',
        sourceUrl: 'https://example.org/data.csv',
        upstreamSha256: 'a'.repeat(64),
        excerpt: '2024-02,5.25',
      },
    ],
  };
}
