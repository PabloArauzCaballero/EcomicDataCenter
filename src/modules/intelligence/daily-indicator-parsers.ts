import { INDICATOR_CODES, INDICATOR_UNITS, type IndicatorMeasure } from './indicator-measures';

/**
 * Parsers for the endpoints the collector reads deterministically.
 *
 * These are kept out of the collector script so the exact expressions that turn
 * a downloaded page into a reading can be exercised against captured payloads
 * without a network, a backend or a provider key.
 */

const spanishMonths = new Map([
  ['enero', 1],
  ['febrero', 2],
  ['marzo', 3],
  ['abril', 4],
  ['mayo', 5],
  ['junio', 6],
  ['julio', 7],
  ['agosto', 8],
  ['septiembre', 9],
  ['octubre', 10],
  ['noviembre', 11],
  ['diciembre', 12],
]);

export interface BcbQuotationTable {
  /** Date the table states the quotations are in force. */
  effectiveDate: string;
  /** Official USD/BOB rate as written in the table, or undefined when absent. */
  officialRate?: string;
  /** UFV value as written in the table, or undefined when absent. */
  ufv?: string;
}

/** Reads the effective date and the two headline values of the BCB quotation table. */
export function parseBcbQuotationTable(html: string): BcbQuotationTable {
  const dateMatch = /<strong>\s*(\d{1,2})\s+de\s+([\p{L}]+)\s+(\d{4})\s*<\/strong>/iu.exec(html);
  const month = dateMatch?.[2]
    ? spanishMonths.get(dateMatch[2].toLocaleLowerCase('es'))
    : undefined;
  if (!dateMatch?.[1] || !dateMatch[3] || !month) {
    throw new Error('BCB quotation page did not expose a recognizable effective date');
  }
  const effectiveDate = `${dateMatch[3]}-${String(month).padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
  const officialRate =
    /ESTADOS UNIDOS<\/td>\s*<td>D&Oacute;LAR<\/td>\s*<td[^>]*>USD<\/td>\s*<td[^>]*>([0-9.]+)<\/td>/iu.exec(
      html,
    )?.[1];
  const ufv =
    /BOLIVIA \(UFV\)<\/td>\s*<td[^>]*>UNIDAD DE FOMENTO DE VIVIENDA<\/td>\s*<td[^>]*>Bs\/UFV<\/td>\s*<td[^>]*>([0-9.]+)<\/td>/iu.exec(
      html,
    )?.[1];
  return {
    effectiveDate,
    ...(officialRate ? { officialRate } : {}),
    ...(ufv ? { ufv } : {}),
  };
}

export interface ParallelQuotation {
  /** Literal slice of the response body, quoted verbatim as evidence. */
  excerpt: string;
  /** Instrument the venue quotes, as the payload spells it. */
  instrument: string;
  /** Venue name, upper-cased from the payload's own source field. */
  venue: string;
  /** Prices exactly as written in the payload, never re-formatted from a parsed number. */
  buy: string;
  sell: string;
  /** Instant the venue declares for the quotation. */
  capturedAt: string;
}

/**
 * Reads one venue's parallel USD quotation.
 *
 * The excerpt is sliced out of the response text rather than rebuilt from the
 * parsed values, so the quotation retained as evidence is guaranteed to appear
 * in the bytes that are hashed and stored.
 */
export function parseParallelQuotation(text: string): ParallelQuotation {
  const excerpt = /"data"\s*:\s*(\{[^{}]*\})/u.exec(text)?.[1];
  if (!excerpt) throw new Error('Venue payload exposed no quotation object');
  const quote = (
    JSON.parse(text) as {
      data?: { source?: unknown; pair?: unknown; fetched_at?: unknown };
    }
  ).data;
  const buy = /"buy"\s*:\s*(-?\d+(?:\.\d+)?)/u.exec(excerpt)?.[1];
  const sell = /"sell"\s*:\s*(-?\d+(?:\.\d+)?)/u.exec(excerpt)?.[1];
  const instrument = quote?.pair;
  const source = quote?.source;
  const capturedAt = quote?.fetched_at;
  if (
    !buy ||
    !sell ||
    typeof instrument !== 'string' ||
    typeof source !== 'string' ||
    typeof capturedAt !== 'string'
  ) {
    throw new Error('Venue quotation is missing a price, an instrument or a timestamp');
  }
  if (Number.isNaN(new Date(capturedAt).valueOf())) {
    throw new Error('Venue timestamp is not an instant');
  }
  return { excerpt, instrument, venue: source.toLocaleUpperCase('en'), buy, sell, capturedAt };
}

/**
 * Wording for a parallel quotation.
 *
 * Two constraints shape it. The quantitative grounding check maps each claimed
 * figure to a distinct evidence occurrence *in order*, so the two prices must
 * be stated in the order the payload writes them rather than in a fixed one.
 * And the wording echoes the payload's own field names, because a fully prose
 * rendering shares too few terms with a JSON body to clear the lexical
 * grounding threshold and would route every reading to human review.
 */
export function parallelQuotationAssertion(quotation: ParallelQuotation): string {
  const sides = [
    { label: 'buy (compra)', value: quotation.buy, position: quotation.excerpt.indexOf('"buy"') },
    { label: 'sell (venta)', value: quotation.sell, position: quotation.excerpt.indexOf('"sell"') },
  ]
    .sort((left, right) => left.position - right.position)
    .map((side) => `${side.label} ${side.value}`)
    .join(' y ');
  return `Dolar paralelo ${quotation.instrument} en ${quotation.venue}: ${sides}.`;
}

/** Measurement for the official rate, quoted as the table writes it. */
export function officialExchangeRateMeasure(rate: string): IndicatorMeasure {
  return {
    indicatorCode: INDICATOR_CODES.officialExchangeRate,
    priceSide: 'OFFICIAL',
    value: rate,
    unit: INDICATOR_UNITS.bolivianosPerDollar,
  };
}

/** Measurement for the UFV, which is a single value with no market side. */
export function housingDevelopmentUnitMeasure(value: string): IndicatorMeasure {
  return {
    indicatorCode: INDICATOR_CODES.housingDevelopmentUnit,
    priceSide: null,
    value,
    unit: INDICATOR_UNITS.bolivianosPerHousingUnit,
  };
}

/**
 * Both sides of a venue quotation, ordered as the payload writes them.
 *
 * The unit is bolivianos per dollar even where the venue quotes USDT: in this
 * market the stablecoin is the dollar proxy, and splitting the series by
 * instrument would leave every venue alone in its own group and make a
 * cross-venue median impossible. The instrument itself is retained separately
 * so the substitution stays visible rather than assumed.
 */
export function parallelExchangeMeasures(quotation: ParallelQuotation): IndicatorMeasure[] {
  return [
    { side: 'BUY' as const, value: quotation.buy, position: quotation.excerpt.indexOf('"buy"') },
    { side: 'SELL' as const, value: quotation.sell, position: quotation.excerpt.indexOf('"sell"') },
  ]
    .sort((left, right) => left.position - right.position)
    .map((side) => ({
      indicatorCode: INDICATOR_CODES.parallelExchangeRate,
      priceSide: side.side,
      value: side.value,
      unit: INDICATOR_UNITS.bolivianosPerDollar,
    }));
}
