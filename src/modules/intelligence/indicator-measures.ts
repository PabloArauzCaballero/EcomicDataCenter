import {
  INDICATOR_CODES,
  INDICATOR_UNITS,
  ungroundedMeasures,
  type IndicatorMeasure,
  type PriceSide,
} from '../../common/economic-indicators/indicator-codes';

export { INDICATOR_CODES, INDICATOR_UNITS, ungroundedMeasures };
export type { IndicatorMeasure, PriceSide };

/**
 * Structured measurement carried alongside a claim.
 *
 * A claim states a figure in prose, which is what a person reads and what the
 * grounding checks verify. Analysis needs the same figure as a number with its
 * unit, and recovering it by parsing Spanish sentences would break the moment a
 * wording changed. The measurement is therefore submitted next to the
 * assertion, derived from the same bytes and held to the same rule: every value
 * must appear in the excerpt retained as evidence.
 */
