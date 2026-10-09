import { z } from 'zod';

export interface ParsedFactorPoint {
  period: string;
  value: string | null;
  status: 'OBSERVED' | 'MISSING' | 'SUPPRESSED';
  excerpt: string;
}

/** Expand JSON numbers without adding precision or dropping small values. */
export function decimalString(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Non-finite observation');
  const text = String(value);
  if (!/[eE]/u.test(text)) return text;
  const [coefficient = '', exponent = '0'] = text.toLowerCase().split('e');
  const negative = coefficient.startsWith('-');
  const unsigned = coefficient.replace('-', '');
  const [whole = '', fraction = ''] = unsigned.split('.');
  const digits = whole + fraction;
  const position = whole.length + Number(exponent);
  const result =
    position <= 0
      ? `0.${'0'.repeat(-position)}${digits}`
      : position >= digits.length
        ? digits + '0'.repeat(position - digits.length)
        : `${digits.slice(0, position)}.${digits.slice(position)}`;
  return `${negative ? '-' : ''}${result}`;
}

const wdiRow = z
  .object({
    indicator: z.object({ id: z.string(), value: z.string() }),
    countryiso3code: z.string(),
    date: z.string().regex(/^\d{4}$/u),
    value: z.number().finite().nullable(),
    obs_status: z.string().optional(),
  })
  .passthrough();
const wdiResponse = z.tuple([
  z.object({ pages: z.number(), sourceid: z.string() }).passthrough(),
  z.array(wdiRow),
]);

function sortedUnique(points: ParsedFactorPoint[]): ParsedFactorPoint[] {
  const seen = new Set<string>();
  for (const point of points) {
    if (seen.has(point.period)) throw new Error(`Duplicate period: ${point.period}`);
    seen.add(point.period);
  }
  return points.sort((a, b) => a.period.localeCompare(b.period));
}

/** Reject API error envelopes, wrong series/country and silently truncated pages. */
export function parseWorldBank(
  text: string,
  indicator: string,
  country: string,
): ParsedFactorPoint[] {
  const [meta, rows] = wdiResponse.parse(JSON.parse(text) as unknown);
  if (meta.pages !== 1 || meta.sourceid !== '2')
    throw new Error('Expected complete WDI source 2 response');
  const points = rows.map((row): ParsedFactorPoint => {
    if (row.indicator.id !== indicator || row.countryiso3code !== country) {
      throw new Error('WDI response identity does not match request');
    }
    // Do not reinterpret undocumented status flags as observed data.
    if (row.obs_status && row.obs_status !== 'F')
      throw new Error(`Unreviewed WDI status ${row.obs_status}`);
    if (row.obs_status === 'F') throw new Error('Forecast rows require separate series');
    return {
      period: row.date,
      value: row.value === null ? null : decimalString(row.value),
      status: row.value === null ? 'MISSING' : 'OBSERVED',
      excerpt: JSON.stringify(row),
    };
  });
  if (!points.some((point) => point.value !== null))
    throw new Error('No reported WDI observations');
  return sortedUnique(points);
}

const SEASONS = [
  'DJF',
  'JFM',
  'FMA',
  'MAM',
  'AMJ',
  'MJJ',
  'JJA',
  'JAS',
  'ASO',
  'SON',
  'OND',
  'NDJ',
];

/** ONI is a rolling three-month statistic, labelled by its middle month. */
export function parseNoaaOni(text: string): ParsedFactorPoint[] {
  const lines = text.trim().split(/\r?\n/u);
  if (!/^\s*SEAS\s+YR\s+TOTAL\s+ANOM\s*$/u.test(lines.shift() ?? '')) {
    throw new Error('Unexpected NOAA ONI header');
  }
  const points = lines
    .filter((line) => line.trim())
    .map((line): ParsedFactorPoint => {
      const match = /^\s*([A-Z]{3})\s+(\d{4})\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*$/u.exec(
        line,
      );
      if (!match) throw new Error(`Malformed ONI row: ${line}`);
      const month = SEASONS.indexOf(match[1] ?? '') + 1;
      if (!month) throw new Error(`Unknown ONI season: ${match[1]}`);
      const value = Number(match[4]);
      return {
        period: `${match[2]}-${String(month).padStart(2, '0')}`,
        value: value === -99.9 || value === -999 ? null : decimalString(value),
        status: value === -99.9 || value === -999 ? 'MISSING' : 'OBSERVED',
        excerpt: line.trim(),
      };
    });
  return sortedUnique(points);
}

const fedRow = z
  .object({ effectiveDate: z.iso.date(), type: z.string(), percentRate: z.number().finite() })
  .passthrough();

export function parseNewYorkFed(text: string, rate: 'EFFR' | 'SOFR'): ParsedFactorPoint[] {
  const { refRates } = z
    .object({ refRates: z.array(fedRow).min(1) })
    .parse(JSON.parse(text) as unknown);
  return sortedUnique(
    refRates.map((row) => {
      if (row.type !== rate) throw new Error('Unexpected New York Fed rate identity');
      return {
        period: row.effectiveDate,
        value: decimalString(row.percentRate),
        status: 'OBSERVED' as const,
        excerpt: JSON.stringify(row),
      };
    }),
  );
}
