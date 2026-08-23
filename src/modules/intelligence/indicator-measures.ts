import { ungroundedNumbers } from './quantitative-grounding';
import {
  INDICATOR_CODES,
  INDICATOR_UNITS,
  type IndicatorMeasure,
  type PriceSide,
} from '../../common/economic-indicators/indicator-codes';

export { INDICATOR_CODES, INDICATOR_UNITS };
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
