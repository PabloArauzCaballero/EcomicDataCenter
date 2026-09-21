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
  /**
   * The parallel rate split by the token actually being traded.
   *
   * The aggregate series above is a median across venues that do not all quote
   * the same instrument: two of the three report BOB/USDT and the third reports
   * BOB/USD without saying which dollar it means. Folding them together was the
   * right call while there was nothing better, because a country with one
   * parallel rate needs one number for it — but it answers "what does a dollar
   * cost" with a figure whose denominator changes between venues.
   *
   * These two answer the question the aggregate cannot: what a dollar costs
   * *through each rail*. They are additions, not replacements. The aggregate
   * keeps its history and stays the headline; renaming or retiring it would
   * break every saved query built on it.
   */
  parallelExchangeRateUsdt: 'FX_PARALLEL_USDT_BOB',
  parallelExchangeRateUsdc: 'FX_PARALLEL_USDC_BOB',
  housingDevelopmentUnit: 'UFV_BOB',
} as const;

/**
 * Dollar-pegged tokens whose boliviano market was checked, and what was found.
 *
 * Recorded in code rather than in a note because the absence is a finding: a
 * reader who sees two stablecoin series is entitled to know that the others
 * were looked for and are not missing by omission. Checked on 2026-09-21
 * against Binance, Bybit, OKX and Bitget peer-to-peer books quoted in
 * bolivianos.
 */
export const STABLECOIN_MARKET_SURVEY = {
  /** Deep and two-sided: hundreds of advertisements on each side. */
  USDT: 'QUOTED',
  /** Real but thin, and on one venue only — Bybit, OKX and Bitget show none. */
  USDC: 'QUOTED_THIN',
  /** One-sided: sell advertisements only, single digits, no bid at all. */
  FDUSD: 'ONE_SIDED',
  /** No boliviano market of any size. */
  DAI: 'NO_MARKET',
  TUSD: 'NO_MARKET',
  PYUSD: 'NO_MARKET',
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
