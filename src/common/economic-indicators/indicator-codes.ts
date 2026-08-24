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

/**
 * Annual macroeconomic series that give the daily rates their context.
 *
 * These are published once a year by a multilateral compiler, not quoted in a
 * market, so they never share a chart axis with an exchange rate and are kept
 * under their own frequency.
 */
export const MACRO_INDICATOR_CODES = {
  consumerPriceInflation: 'CPI_INFLATION_ANNUAL_PCT',
  realGdpGrowth: 'GDP_GROWTH_ANNUAL_PCT',
  grossDomesticProduct: 'GDP_CURRENT_USD',
  grossDomesticProductPerCapita: 'GDP_PER_CAPITA_USD',
  internationalReserves: 'INTERNATIONAL_RESERVES_USD',
  currentAccountBalance: 'CURRENT_ACCOUNT_PCT_GDP',
  exportsOfGoodsAndServices: 'EXPORTS_GOODS_SERVICES_USD',
  importsOfGoodsAndServices: 'IMPORTS_GOODS_SERVICES_USD',
  externalDebt: 'EXTERNAL_DEBT_USD',
  unemployment: 'UNEMPLOYMENT_PCT',
  lendingInterestRate: 'LENDING_RATE_PCT',
} as const;

/** How often a series is published, which decides where it may be charted. */
export type IndicatorFrequency = 'DAILY' | 'ANNUAL';

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
