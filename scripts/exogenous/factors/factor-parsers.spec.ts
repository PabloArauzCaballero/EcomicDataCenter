import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFactorSeries, collectFactors } from './collect-factors';
import { FACTOR_MANIFEST } from './factor-manifest';
import type { FactorSpec } from './factor-manifest';
import { decimalString, parseNewYorkFed, parseNoaaOni, parseWorldBank } from './factor-parsers';
import { attachEvidence, downloadFactor, factorDefinitionKey } from './factor-state';
import type { FactorDownload } from './factor-state';

const fixture = (value: number | null, country = 'BOL', pages = 1) =>
  JSON.stringify([
    { pages, sourceid: '2', lastupdated: '2026-07-13' },
    [
      {
        indicator: { id: 'SH.H2O.BASW.ZS', value: 'Water' },
        countryiso3code: country,
        date: '2024',
        value,
        obs_status: '',
      },
      {
        indicator: { id: 'SH.H2O.BASW.ZS', value: 'Water' },
        countryiso3code: country,
        date: '2025',
        value: null,
        obs_status: '',
      },
    ],
  ]);
const download = (text: string, at = '2026-10-04T12:00:00.000Z'): FactorDownload => {
  const bytes = Buffer.from(text);
  return {
    bytes,
    retrievedAt: at,
    sourceUrl: 'https://api.worldbank.org/fixture',
    upstreamSha256: createHash('sha256').update(bytes).digest('hex'),
  };
};

describe('factor parsers and revision clocks', () => {
  it('preserves reported nulls, zero and original evidence without using lastupdated as publication', () => {
    const data = download(fixture(0));
    const rows = parseWorldBank(data.bytes.toString(), 'SH.H2O.BASW.ZS', 'BOL');
    const points = attachEvidence(rows, data, []);
    expect(points.map((point) => [point.value, point.status])).toEqual([
      ['0', 'OBSERVED'],
      [null, 'MISSING'],
    ]);
    expect(points[0]?.publishedAt).toBeNull();
    expect(points[0]?.firstSeenAt).toBe(data.retrievedAt);
  });

  it.each([
    ['wrong country', fixture(1, 'BRA')],
    ['partial page', fixture(1, 'BOL', 2)],
    ['API error', '[{"message":[{"id":"120","value":"Invalid value"}]}]'],
    ['empty observations', fixture(null)],
  ])('rejects %s rather than publishing a partial series', (_, text) => {
    expect(() => parseWorldBank(text, 'SH.H2O.BASW.ZS', 'BOL')).toThrow();
  });

  it('rejects duplicate periods', () => {
    expect(() =>
      parseNoaaOni('SEAS YR TOTAL ANOM\nDJF 2024 27.00 1.10\nDJF 2024 27.00 1.20'),
    ).toThrow('Duplicate period');
  });

  it('maps rolling seasons to middle month and preserves negative anomalies', () => {
    const points = parseNoaaOni('SEAS YR TOTAL ANOM\nDJF 2024 27.00 -1.10\nNDJ 2024 27.00 0.20');
    expect(points.map((point) => [point.period, point.value])).toEqual([
      ['2024-01', '-1.1'],
      ['2024-12', '0.2'],
    ]);
  });

  it('does not zero-fill missing NOAA values or silently skip malformed rows', () => {
    expect(parseNoaaOni('SEAS YR TOTAL ANOM\nDJF 2024 27.00 -99.9')[0]?.status).toBe('MISSING');
    expect(() => parseNoaaOni('SEAS YR TOTAL ANOM\nbroken')).toThrow('Malformed');
  });

  it('reads daily Fed values without manufacturing non-business days', () => {
    const text = JSON.stringify({
      refRates: [
        { effectiveDate: '2026-10-02', type: 'EFFR', percentRate: 3.88 },
        { effectiveDate: '2026-10-01', type: 'EFFR', percentRate: 3.88 },
      ],
    });
    expect(parseNewYorkFed(text, 'EFFR').map((point) => point.period)).toEqual([
      '2026-10-01',
      '2026-10-02',
    ]);
    expect(() => parseNewYorkFed(text, 'SOFR')).toThrow('identity');
  });

  it('expands exponent notation without rounding tiny values to zero', () => {
    expect(decimalString(1e-9)).toBe('0.000000001');
    expect(decimalString(-1.23e21)).toBe('-1230000000000000000000');
  });

  it('retains firstSeen for unchanged rows despite updated download metadata', () => {
    const text = fixture(20);
    const rows = parseWorldBank(text, 'SH.H2O.BASW.ZS', 'BOL');
    const first = attachEvidence(rows, download(text), []);
    const next = attachEvidence(rows, download(text, '2026-10-05T12:00:00.000Z'), first);
    expect(next[0]?.firstSeenAt).toBe(first[0]?.firstSeenAt);
    expect(next[0]?.retrievedAt).not.toBe(first[0]?.retrievedAt);
  });

  it('assigns new knowledge time for A to B to A revisions', () => {
    const values = [10, 20, 10];
    let points = attachEvidence(
      parseWorldBank(fixture(10), 'SH.H2O.BASW.ZS', 'BOL'),
      download(fixture(10)),
      [],
    );
    for (const [index, value] of values.slice(1).entries()) {
      const at = `2026-10-0${index + 5}T12:00:00.000Z`;
      points = attachEvidence(
        parseWorldBank(fixture(value), 'SH.H2O.BASW.ZS', 'BOL'),
        download(fixture(value), at),
        points,
      );
      expect(points[0]?.firstSeenAt).toBe(at);
    }
  });

  it('keeps knowledge time when the global response hash changes but the observation does not', () => {
    const original = fixture(20);
    const changed = original.replace('2026-07-13', '2026-08-13');
    const rows = parseWorldBank(original, 'SH.H2O.BASW.ZS', 'BOL');
    const first = attachEvidence(rows, download(original), []);
    const next = attachEvidence(
      parseWorldBank(changed, 'SH.H2O.BASW.ZS', 'BOL'),
      download(changed, '2026-10-05T12:00:00.000Z'),
      first,
    );
    expect(next[0]?.firstSeenAt).toBe(first[0]?.firstSeenAt);
    expect(next[0]?.upstreamSha256).not.toBe(first[0]?.upstreamSha256);
  });

  it('retries a transient failure once and respects the NOAA minimum delay', async () => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('SEAS YR TOTAL ANOM'));
    const pause = jest.fn<Promise<void>, [number]>().mockResolvedValue(undefined);
    const result = await downloadFactor(
      'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt',
      { request, pause },
    );
    expect(request).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledWith(60000);
    expect(result.bytes.toString()).toBe('SEAS YR TOTAL ANOM');
  });

  it('does not retry permanent HTTP errors', async () => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(new Response('', { status: 404 }));
    await expect(downloadFactor('https://api.worldbank.org/missing', { request })).rejects.toThrow(
      '404',
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('keeps the last good series and its timestamps when upstream fails', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'exogenous-factors-test-'));
    const options = {
      seedPath: join(directory, 'seed.json'),
      evidenceDirectory: join(directory, 'evidence'),
      manifest: [FACTOR_MANIFEST[0]!],
      now: new Date('2026-10-04T12:00:00.000Z'),
    };
    await collectFactors({
      ...options,
      fetcher: async (url) => ({ ...download(fixture(20)), sourceUrl: url }),
    });
    const original = readFileSync(options.seedPath, 'utf8');
    const result = await collectFactors({
      ...options,
      fetcher: async () => {
        throw new Error('upstream outage');
      },
    });
    expect(readFileSync(options.seedPath, 'utf8')).toBe(original);
    expect(result.statuses[0]?.status).toBe('FAILED_KEPT');
  });

  it.each<Partial<FactorSpec>>([
    { unit: 'otra unidad' },
    { geography: 'Otra geografía' },
    { transformationType: 'DERIVED' },
    { observationStatus: 'OBSERVED' },
    { measurementStatus: 'DIRECT' },
    { sourceSeriesKey: 'WDI:BOL:REVISED' },
    { note: 'Definición corregida' },
    { targetScope: 'Otro resultado objetivo' },
  ])('does not backdate changed metadata %j even when numeric values are identical', (patch) => {
    const original = FACTOR_MANIFEST[0]!;
    const first = buildFactorSeries(original, download(fixture(20)));
    const at = '2026-10-05T12:00:00.000Z';
    const next = buildFactorSeries({ ...original, ...patch }, download(fixture(20), at), first);
    expect(next.points[0]?.value).toBe(first.points[0]?.value);
    expect(next.points[0]?.firstSeenAt).toBe(at);
    expect(next.points[0]?.publishedAt).toBeNull();
  });

  it('treats frequency as meaning while ignoring set ordering and query-window changes', () => {
    const original = {
      ...FACTOR_MANIFEST[0]!,
      familyIds: ['ST_081', 'PRD_CL09'],
      sectorIds: ['A', 'E'],
    };
    const first = buildFactorSeries(original, download(fixture(20)));
    expect(factorDefinitionKey({ ...first, frequency: 'MONTHLY' })).not.toBe(
      factorDefinitionKey(first),
    );
    const later = {
      ...download(fixture(20), '2026-10-05T12:00:00.000Z'),
      sourceUrl: 'https://api.worldbank.org/fixture?date=2000:2027',
    };
    const next = buildFactorSeries(
      { ...original, familyIds: ['PRD_CL09', 'ST_081'], sectorIds: ['E', 'A'] },
      later,
      first,
    );
    expect(next.points[0]?.firstSeenAt).toBe(first.points[0]?.firstSeenAt);
  });

  it('journals both old and new metadata before replacing the last good seed', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'exogenous-factor-metadata-test-'));
    const original = FACTOR_MANIFEST[0]!;
    const options = {
      seedPath: join(directory, 'seed.json'),
      evidenceDirectory: join(directory, 'evidence'),
      now: new Date('2026-10-04T12:00:00.000Z'),
    };
    const first = await collectFactors({
      ...options,
      manifest: [original],
      fetcher: async (url) => ({ ...download(fixture(20)), sourceUrl: url }),
    });
    const at = '2026-10-05T12:00:00.000Z';
    const second = await collectFactors({
      ...options,
      manifest: [{ ...original, unit: 'unidad corregida' }],
      fetcher: async (url) => ({ ...download(fixture(20), at), sourceUrl: url }),
    });
    const records = readFileSync(join(options.evidenceDirectory, 'revisions.jsonl'), 'utf8')
      .trim()
      .split('\n');
    const revision = JSON.parse(records[1]!) as {
      version: number;
      previous: (typeof first.seed.series)[number];
      current: (typeof second.seed.series)[number];
    };
    expect(revision.version).toBe(2);
    expect(revision.previous).toEqual(first.seed.series[0]);
    expect(revision.current).toEqual(second.seed.series[0]);
    expect(revision.current.points[0]?.firstSeenAt).toBe(at);
    expect(revision.previous.points[0]?.firstSeenAt).not.toBe(at);
  });
});
