import { parseStablecoinBook } from '../stablecoin-book-parsers';
import {
  stablecoinBookAssertion,
  stablecoinBookMeasure,
  stablecoinBookTitle,
} from '../stablecoin-book-readings';
import { assessLexicalGrounding } from '../claim-evidence-grounding';
import { comparable } from '../evidence-quality';
import { ungroundedNumbers } from '../../../common/intelligence/quantitative-grounding';
import { ungroundedMeasures } from '../indicator-measures';

/**
 * Captured from the exchange's peer-to-peer search endpoint on 2026-09-21, with
 * the advertiser objects and the payment-method lists trimmed out. Everything
 * the parser reads is kept exactly as the response wrote it, because the
 * excerpt it returns has to be a literal slice of these bytes.
 */
function advertisement(price: string, tradeType: string, asset = 'USDT'): string {
  return (
    `{"adv":{"advNo":"12896190477883592704","classify":"profession",` +
    `"tradeType":"${tradeType}","asset":"${asset}","fiatUnit":"BOB",` +
    `"price":"${price}","surplusAmount":"454.14","tradableQuantity":"453.00",` +
    `"minSingleTransAmount":"5430","maxSingleTransAmount":"5445","payTimeLimit":15},` +
    `"advertiser":{"nickName":"comerciante"}}`
  );
}

function book(prices: readonly string[], tradeType: string, asset = 'USDT'): string {
  const entries = prices.map((price) => advertisement(price, tradeType, asset)).join(',');
  return `{"code":"000000","message":null,"data":[${entries}],"total":${prices.length * 7},"success":true}`;
}

/** The asks, as the exchange serves them: cheapest advertisement first. */
const askBook = book(['11.99', '12.00', '12.03', '12.04', '12.09'], 'SELL');
/** The bids, best first, which on this side means the highest. */
const bidBook = book(['12.01', '11.99', '11.98', '11.97', '11.90'], 'BUY');

describe('stablecoinBookTitle', () => {
  it('se puede citar del propio libro, que es lo que exige la ingesta', () => {
    // La validación previa a la ingesta comprueba que el título aparezca
    // literal en el documento descargado. Esta prueba existe porque esa
    // comprobación se incumplía en producción sin que nada lo dijera: el
    // título era el par «USDT/BOB», el libro nunca escribe ese par —deletrea
    // la ficha y el fiat en campos separados— y las cuatro lecturas de las dos
    // fichas que cotizan se rechazaban en cada corrida, con la categoría
    // entera figurando como no recogida. El par describe mejor la lectura y no
    // sirve de título: no está en la fuente.
    for (const [text, side] of [
      [askBook, 'SELL'],
      [bidBook, 'BUY'],
    ] as const) {
      const quote = parseStablecoinBook(text, side, 'USDT');
      expect(comparable(text)).toContain(comparable(stablecoinBookTitle(quote)));
      expect(comparable(text)).not.toContain(comparable(`${quote.asset}/${quote.fiat}`));
    }
  });

  it('deletrea la ficha como la deletrea el libro, no como la pidió el colector', () => {
    const quote = parseStablecoinBook(
      book(['12.50', '12.50', '12.50'], 'SELL', 'USDC'),
      'SELL',
      'usdc',
    );
    expect(stablecoinBookTitle(quote)).toBe('USDC');
  });
});

describe('stablecoinBookAssertion', () => {
  const quote = parseStablecoinBook(askBook, 'SELL');
  const assertion = stablecoinBookAssertion(quote);

  it('names the side in the reader’s terms', () => {
    expect(assertion).toBe(
      'Dolar paralelo asset USDT fiatUnit BOB tradeType SELL (venta al lector): price 12.03.',
    );
  });

  it('cites no figure the excerpt does not contain', () => {
    expect(ungroundedNumbers(assertion, quote.excerpt)).toEqual([]);
  });

  it('stays lexically grounded, so the reading is not routed to review', () => {
    // This is the property that decides whether the series ever publishes: a
    // prose rendering shares too few terms with a JSON body to clear the
    // threshold, and every reading would be held for a human instead.
    expect(assessLexicalGrounding(assertion, quote.excerpt).status).toBe('SUPPORTED');
  });

  it('states the figure for the other side against its own evidence', () => {
    const bid = parseStablecoinBook(bidBook, 'BUY');
    const bidAssertion = stablecoinBookAssertion(bid);

    expect(bidAssertion).toContain('tradeType BUY (compra al lector): price 11.98');
    expect(ungroundedNumbers(bidAssertion, bid.excerpt)).toEqual([]);
    expect(assessLexicalGrounding(bidAssertion, bid.excerpt).status).toBe('SUPPORTED');
  });
});

describe('stablecoinBookMeasure', () => {
  it('sends each token to its own series, with the side resolved', () => {
    expect(stablecoinBookMeasure(parseStablecoinBook(askBook, 'SELL'))).toEqual({
      indicatorCode: 'FX_PARALLEL_USDT_BOB',
      priceSide: 'SELL',
      value: '12.03',
      unit: 'BOB/USD',
    });
    expect(
      stablecoinBookMeasure(
        parseStablecoinBook(book(['12.19', '12.19', '12.19'], 'BUY', 'USDC'), 'BUY'),
      ),
    ).toEqual({
      indicatorCode: 'FX_PARALLEL_USDC_BOB',
      priceSide: 'BUY',
      value: '12.19',
      unit: 'BOB/USD',
    });
  });

  it('quotes both tokens in bolivianos per dollar, so they share an axis', () => {
    // The series exists to show whether a USDC dollar costs more than a USDT
    // one. Quoting them per token would put them on separate axes and hide the
    // comparison the series was added to make.
    const usdt = stablecoinBookMeasure(parseStablecoinBook(askBook, 'SELL'));
    const usdc = stablecoinBookMeasure(
      parseStablecoinBook(book(['12.19', '12.19', '12.19'], 'SELL', 'USDC'), 'SELL'),
    );

    expect(usdc.unit).toBe(usdt.unit);
  });

  it('refuses a token that has no series rather than filing it somewhere', () => {
    // DAI: el agregador aun lista una plaza para el, con un sello de hace
    // semanas, y ninguna bolsa tiene libro. No se pide, asi que no tiene serie,
    // y una lectura suya no debe acabar archivada en la de otra ficha.
    const dai = parseStablecoinBook(book(['11.71', '11.71', '11.71'], 'SELL', 'DAI'), 'SELL');

    expect(() => stablecoinBookMeasure(dai)).toThrow(/No series is defined for DAI/u);
  });

  it('da serie a la ficha cuyo libro acaba de abrirse', () => {
    // FDUSD tenia un solo lado el 2026-09-21 y los dos el 22. Se pedia ya
    // entonces, que es justo el motivo de pedir fichas sin mercado: que la que
    // abra no pierda sus primeras jornadas esperando a que alguien lo note.
    const fdusd = parseStablecoinBook(book(['11.71', '11.72', '11.73'], 'SELL', 'FDUSD'), 'SELL');

    expect(stablecoinBookMeasure(fdusd).indicatorCode).toBe('FX_PARALLEL_FDUSD_BOB');
  });

  it('grounds the measured value in the excerpt it was read from', () => {
    const quote = parseStablecoinBook(askBook, 'SELL');

    expect(ungroundedMeasures([stablecoinBookMeasure(quote)], quote.excerpt)).toEqual([]);
  });
});
