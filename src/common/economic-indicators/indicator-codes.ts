import { ungroundedNumbers } from '../intelligence/quantitative-grounding';

/**
 * Cross-cutting contract for a measured economic indicator.
 *
 * The daily collector, the historical backfill in the database layer and the
 * read models a dashboard charts all have to agree on these identifiers, so
 * they live where every layer may reach them rather than inside one module.
 */

/**
 * Stable identifiers for the series a dashboard charts.
 *
 * These are a contract with anything downstream: renaming one silently breaks
 * every saved query and panel built on it.
 */
export const INDICATOR_CODES = {
  officialExchangeRate: 'FX_OFFICIAL_USD_BOB',
  parallelExchangeRate: 'FX_PARALLEL_USD_BOB',
  housingDevelopmentUnit: 'UFV_BOB',
} as const;

/** Bolivianos per unit of the quoted instrument. */
export const INDICATOR_UNITS = {
  bolivianosPerDollar: 'BOB/USD',
  bolivianosPerHousingUnit: 'BOB/UFV',
} as const;

/**
 * Side of a quotation.
 *
 * `OFFICIAL` is a single administered rate with no two-sided market. `BUY` and
 * `SELL` are reported as the venue itself labels them, never reinterpreted.
 */
export type PriceSide = 'OFFICIAL' | 'BUY' | 'SELL';

export interface IndicatorMeasure {
  readonly indicatorCode: string;
  readonly priceSide: PriceSide | null;
  /**
   * Value exactly as the source writes it.
   *
   * Kept as text so it is never re-formatted through a floating-point round
   * trip: a value that no longer matches the source character for character
   * would fail its own grounding check.
   */
  readonly value: string;
  readonly unit: string;
}

/**
 * Values that do not appear in the excerpt retained as evidence.
 *
 * Each value is checked on its own rather than as one sequence, because the
 * ordered check exists to stop a claim from reusing a single occurrence for
 * several figures, and measurements are independent readings.
 */
export function ungroundedMeasures(
  measures: readonly IndicatorMeasure[],
  excerpt: string,
): string[] {
  const ungrounded = measures
    .filter((measure) => ungroundedNumbers(measure.value, excerpt).length > 0)
    .map((measure) => measure.value);
  return [...new Set(ungrounded)];
}
