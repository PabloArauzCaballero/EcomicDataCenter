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
  /**
   * Tokens whose boliviano book is read on every run and has so far been empty.
   *
   * They carry a code although no reading exists yet, and that is the point.
   * The alternative — adding the code on the day a market appears — means the
   * first weeks of a new rail are lost while somebody notices, writes the
   * migration and deploys it. The collector asks the exchange for all of them
   * each run, so the day one of these books opens the series starts itself.
   *
   * An empty series costs nothing downstream: the read model groups by the code
   * it finds in the readings, so a code with no readings produces no rows and
   * no line.
   */
  parallelExchangeRateUsds: 'FX_PARALLEL_USDS_BOB',
  parallelExchangeRateUsde: 'FX_PARALLEL_USDE_BOB',
  parallelExchangeRatePyusd: 'FX_PARALLEL_PYUSD_BOB',
  housingDevelopmentUnit: 'UFV_BOB',
} as const;

/**
 * Dollar-pegged tokens whose boliviano market was checked, and what was found.
 *
 * Recorded in code rather than in a note because the absence is a finding: a
 * reader who sees two stablecoin lines is entitled to know that the others were
 * looked for and are not missing by omission. The panel prints this census, so
 * a token that has no line says why it has none instead of simply not being
 * there.
 *
 * Checked on 2026-09-21 against the Binance, Bybit and OKX peer-to-peer books
 * quoted in bolivianos, counting the advertisements each side returned. The
 * counts are the evidence and they are stated here rather than summarised:
 *
 * | token | bid side | ask side |
 * | ----- | -------- | -------- |
 * | USDT  |      146 |      266 |
 * | USDC  |       13 |       33 |
 * | FDUSD |        0 |        7 |
 * | USDS, USDe, PYUSD, DAI, TUSD | 0 | 0 |
 *
 * This is a reading of the market on a day, not a permanent property of these
 * tokens, which is why the collector keeps asking for every one of them rather
 * than trusting this table. The table says what to tell the reader today; the
 * collector decides what actually gets a series.
 */
export const STABLECOIN_MARKET_SURVEY = {
  /** Deep and two-sided: hundreds of advertisements on each side. */
  USDT: 'QUOTED',
  /** Real but thin, and on one venue only — Bybit, OKX and Bitget show none. */
  USDC: 'QUOTED_THIN',
  /**
   * One-sided: a handful of sell advertisements and no bid at all.
   *
   * Not published. A side without its opposite has no mid-point, and half a
   * quotation is not a price — the same rule the read model applies when it
   * drops a venue that showed one side.
   */
  FDUSD: 'ONE_SIDED',
  /**
   * No boliviano market: both sides of the book came back empty.
   *
   * USDS, USDe and PYUSD are here because they were asked for by name. They are
   * large tokens elsewhere and it is reasonable to expect them; in bolivianos
   * they are simply not traded, and the collector asks for them every run so
   * the day that changes the series begins on its own.
   */
  USDS: 'NO_MARKET',
  USDE: 'NO_MARKET',
  PYUSD: 'NO_MARKET',
  DAI: 'NO_MARKET',
  TUSD: 'NO_MARKET',
} as const;

/** The day the census above was taken, which is what the panel cites. */
export const STABLECOIN_MARKET_SURVEY_DATE = '2026-09-21';

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
