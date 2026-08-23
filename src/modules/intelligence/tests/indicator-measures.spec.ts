import {
  INDICATOR_CODES,
  INDICATOR_UNITS,
  ungroundedMeasures,
  type IndicatorMeasure,
} from '../indicator-measures';
import {
  housingDevelopmentUnitMeasure,
  officialExchangeRateMeasure,
  parallelExchangeMeasures,
  parseParallelQuotation,
} from '../daily-indicator-parsers';

const venuePayload =
  '{"data":{"source":"eldorado","pair":"BOB/USDT","buy":11.68,"sell":11.51,' +
  '"fetched_at":"2026-08-22T23:58:41.358098+00:00"}}';

describe('indicator codes', () => {
  it('pins the identifiers every saved query and panel is built on', () => {
    // Renaming one of these silently breaks every dashboard already charting it,
    // so a change here has to be a deliberate one, not a refactor.
    expect(INDICATOR_CODES).toEqual({
      officialExchangeRate: 'FX_OFFICIAL_USD_BOB',
      parallelExchangeRate: 'FX_PARALLEL_USD_BOB',
      housingDevelopmentUnit: 'UFV_BOB',
    });
    expect(INDICATOR_UNITS).toEqual({
      bolivianosPerDollar: 'BOB/USD',
      bolivianosPerHousingUnit: 'BOB/UFV',
    });
  });
});

describe('measure builders', () => {
  it('quotes the official rate exactly as the table writes it', () => {
    expect(officialExchangeRateMeasure('11.50')).toEqual({
      indicatorCode: 'FX_OFFICIAL_USD_BOB',
      priceSide: 'OFFICIAL',
      value: '11.50',
      unit: 'BOB/USD',
    });
  });

  it('records the UFV as a single value with no market side', () => {
    const measure = housingDevelopmentUnitMeasure('3.33427');

    expect(measure.priceSide).toBeNull();
    expect(measure.value).toBe('3.33427');
    expect(measure.unit).toBe('BOB/UFV');
  });

  it('reports both sides of a venue quotation', () => {
    const measures = parallelExchangeMeasures(parseParallelQuotation(venuePayload));

    expect(measures).toEqual([
      {
        indicatorCode: 'FX_PARALLEL_USD_BOB',
        priceSide: 'BUY',
        value: '11.68',
        unit: 'BOB/USD',
      },
      {
        indicatorCode: 'FX_PARALLEL_USD_BOB',
        priceSide: 'SELL',
        value: '11.51',
        unit: 'BOB/USD',
      },
    ]);
  });

  it('keeps a USDT quotation in the same series as a USD one', () => {
    // Splitting the series by instrument would leave each venue alone in its
    // own group and make a cross-venue median impossible.
    const usdt = parallelExchangeMeasures(parseParallelQuotation(venuePayload));
    const usd = parallelExchangeMeasures(
      parseParallelQuotation(
        '{"data":{"source":"takenos","pair":"BOB/USD","buy":11.92,"sell":11.47,' +
          '"fetched_at":"2026-08-22T23:59:52.254350+00:00"}}',
      ),
    );

    expect(usdt[0]?.unit).toBe(usd[0]?.unit);
    expect(usdt[0]?.indicatorCode).toBe(usd[0]?.indicatorCode);
  });
});

describe('ungroundedMeasures', () => {
  const excerpt = '{"source":"eldorado","pair":"BOB/USDT","buy":11.68,"sell":11.51}';

  it('accepts values the excerpt contains', () => {
    const measures = parallelExchangeMeasures(parseParallelQuotation(venuePayload));

    expect(ungroundedMeasures(measures, excerpt)).toEqual([]);
  });

  it('reports a value the excerpt does not contain', () => {
    const invented: IndicatorMeasure[] = [
      { indicatorCode: 'FX_PARALLEL_USD_BOB', priceSide: 'BUY', value: '12.40', unit: 'BOB/USD' },
    ];

    expect(ungroundedMeasures(invented, excerpt)).toEqual(['12.40']);
  });

  it('checks each value independently of the others', () => {
    // The ordered check exists to stop one occurrence being reused for several
    // figures in a sentence. Measurements are separate readings, so stating
    // them in either order has to be accepted.
    const reversed: IndicatorMeasure[] = [
      { indicatorCode: 'FX_PARALLEL_USD_BOB', priceSide: 'SELL', value: '11.51', unit: 'BOB/USD' },
      { indicatorCode: 'FX_PARALLEL_USD_BOB', priceSide: 'BUY', value: '11.68', unit: 'BOB/USD' },
    ];

    expect(ungroundedMeasures(reversed, excerpt)).toEqual([]);
  });

  it('accepts an empty measurement set', () => {
    expect(ungroundedMeasures([], excerpt)).toEqual([]);
  });
});
