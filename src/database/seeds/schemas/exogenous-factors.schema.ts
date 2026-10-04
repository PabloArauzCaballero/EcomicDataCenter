import { z } from 'zod';

export const FACTOR_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'] as const;
export type FactorFrequency = (typeof FACTOR_FREQUENCIES)[number];

/** UTC period start; ISO weeks are validated against their ISO week-year. */
export function factorPeriodStart(period: string, frequency: FactorFrequency): string | null {
  const year = Number(period.slice(0, 4));
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return null;
  if (frequency === 'ANNUAL') return /^\d{4}$/u.test(period) ? `${period}-01-01` : null;
  if (frequency === 'MONTHLY') {
    return /^\d{4}-(?:0[1-9]|1[0-2])$/u.test(period) ? `${period}-01` : null;
  }
  if (frequency === 'QUARTERLY') {
    if (!/^\d{4}-Q[1-4]$/u.test(period)) return null;
    return `${year}-${String((Number(period.at(-1)) - 1) * 3 + 1).padStart(2, '0')}-01`;
  }
  if (frequency === 'WEEKLY') {
    if (!/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/u.test(period)) return null;
    const january4 = new Date(Date.UTC(year, 0, 4));
    const monday = new Date(january4);
    monday.setUTCDate(4 - ((january4.getUTCDay() + 6) % 7) + (Number(period.slice(-2)) - 1) * 7);
    const thursday = new Date(monday);
    thursday.setUTCDate(monday.getUTCDate() + 3);
    return thursday.getUTCFullYear() === year ? monday.toISOString().slice(0, 10) : null;
  }
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u.test(period)) return null;
  const date = new Date(`${period}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === period
    ? period
    : null;
}

const label = z.string().trim().min(1).max(1_000);
const identifier = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/u)
  .max(100);
const instant = z.iso.datetime({ offset: false });
const publicUrl = z.url().refine((url) => /^https?:\/\//u.test(url), 'HTTP(S) source required');
const point = z
  .object({
    period: z.string().min(4).max(10),
    value: z
      .string()
      .regex(/^-?\d+(?:\.\d+)?$/u, 'Decimal string without exponent')
      .nullable(),
    status: z.enum(['OBSERVED', 'MISSING', 'SUPPRESSED']),
    publishedAt: instant.nullable(),
    firstSeenAt: instant,
    retrievedAt: instant,
    sourceUrl: publicUrl,
    upstreamSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    excerpt: z.string().trim().min(1).max(4_000),
  })
  .strict()
  .superRefine((entry, context) => {
    if ((entry.status === 'OBSERVED') !== (entry.value !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Observed requires a value; missing/suppressed require null',
      });
    }
    for (const field of ['publishedAt', 'firstSeenAt'] as const) {
      if (entry[field] !== null && Date.parse(entry[field]) > Date.parse(entry.retrievedAt)) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Knowledge cannot be later than retrieval',
        });
      }
    }
  });

const series = z
  .object({
    code: identifier,
    familyIds: z.array(identifier).min(1),
    sectorIds: z.array(z.string().regex(/^[A-U]$/u)).min(1),
    name: label,
    measureType: z.enum([
      'PRICE',
      'INDEX',
      'RATE',
      'STOCK',
      'FLOW',
      'QUANTITY',
      'COUNT',
      'DURATION',
      'PROPORTION',
    ]),
    unit: label,
    frequency: z.enum(FACTOR_FREQUENCIES),
    geography: label,
    market: label,
    publisher: label,
    sourceUrl: publicUrl,
    sourceSeriesKey: label,
    note: z.string().trim().min(1).max(4_000),
    economicRole: z.enum(['EXTERNAL_DRIVER', 'CONDITION', 'EXPOSURE', 'OUTCOME', 'UNCLASSIFIED']),
    targetScope: label,
    observationStatus: z.enum(['OBSERVED', 'ESTIMATED', 'FORECAST']),
    measurementStatus: z.enum(['DIRECT', 'PROXY']),
    transformationType: z.enum(['ORIGINAL', 'AGGREGATE', 'ANOMALY', 'DERIVED']),
    licenseStatus: z.enum(['PUBLIC_REUSE_ALLOWED', 'PENDING_REVIEW', 'RESTRICTED']),
    freshnessDays: z.number().int().nonnegative().nullable(),
    points: z.array(point).min(1),
  })
  .strict()
  .superRefine((entry, context) => {
    for (const field of ['familyIds', 'sectorIds'] as const) {
      if (new Set(entry[field]).size !== entry[field].length) {
        context.addIssue({ code: 'custom', path: [field], message: 'Duplicate identifiers' });
      }
    }
    const periods = new Set<string>();
    entry.points.forEach((value, index) => {
      const start = factorPeriodStart(value.period, entry.frequency);
      if (!start) {
        context.addIssue({
          code: 'custom',
          path: ['points', index, 'period'],
          message: 'Invalid calendar period for frequency',
        });
      } else if (entry.observationStatus !== 'FORECAST' && start > value.retrievedAt.slice(0, 10)) {
        context.addIssue({
          code: 'custom',
          path: ['points', index, 'period'],
          message: 'A future period must be explicitly forecast',
        });
      }
      if (periods.has(value.period)) {
        context.addIssue({
          code: 'custom',
          path: ['points', index, 'period'],
          message: 'One revision per period in a seed; subsequent seeds preserve new revisions',
        });
      }
      periods.add(value.period);
    });
  });

export const exogenousFactorsSchema = z
  .object({ version: z.literal(1), series: z.array(series).min(1) })
  .strict()
  .superRefine((seed, context) => {
    const codes = new Set<string>();
    seed.series.forEach((entry, index) => {
      if (codes.has(entry.code))
        context.addIssue({
          code: 'custom',
          path: ['series', index, 'code'],
          message: 'Duplicate series code',
        });
      codes.add(entry.code);
    });
  });

export type ExogenousFactors = z.infer<typeof exogenousFactorsSchema>;
export type ExogenousFactorSeries = ExogenousFactors['series'][number];
export type ExogenousFactorPoint = ExogenousFactorSeries['points'][number];
