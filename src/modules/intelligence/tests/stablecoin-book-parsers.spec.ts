import {
  BOOK_SIDE_REQUEST,
  EmptyBookError,
  parseStablecoinBook,
  stablecoinBookAssertion,
  stablecoinBookMeasure,
} from '../stablecoin-book-parsers';
import { assessLexicalGrounding } from '../claim-evidence-grounding';
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

describe('BOOK_SIDE_REQUEST', () => {
  it('inverts the side, because the query speaks for the reader', () => {
    // Asking what the reader pays means asking for the advertisements they can
    // buy from. Getting this backwards silently returns the other half of the
    // book, which is why it is pinned by a test rather than left to a comment.
    expect(BOOK_SIDE_REQUEST.SELL).toBe('BUY');
    expect(BOOK_SIDE_REQUEST.BUY).toBe('SELL');
  });
});

describe('parseStablecoinBook', () => {
  it('quotes the discrete median of the side, not the top of the book', () => {
    const quote = parseStablecoinBook(askBook, 'SELL');

    expect(quote.price).toBe('12.03');
    expect(quote.bestPrice).toBe('11.99');
    expect(quote.advertisementsRead).toBe(5);
    expect(quote.asset).toBe('USDT');
    expect(quote.fiat).toBe('BOB');
    expect(quote.advertisedTradeType).toBe('SELL');
  });

  it('takes the best bid as the highest and the best ask as the lowest', () => {
    // "Best" is whatever favours whoever is on the reader's side, so the two
    // sides cannot share one rule.
    expect(parseStablecoinBook(askBook, 'SELL').bestPrice).toBe('11.99');
    expect(parseStablecoinBook(bidBook, 'BUY').bestPrice).toBe('12.01');
  });

  it('returns a spread even where the top of the book is crossed', () => {
    // This is the reason the median is published. In this market the best bid
    // regularly sits above the best ask — 12.01 against 11.99 here, captured
    // that way — because the two are reachable through different payment rails.
    // Top of book would report a negative spread, which is not a thing a
    // quotation can have.
    const ask = parseStablecoinBook(askBook, 'SELL');
    const bid = parseStablecoinBook(bidBook, 'BUY');

    expect(Number(bid.bestPrice)).toBeGreaterThan(Number(ask.bestPrice));
    expect(Number(ask.price)).toBeGreaterThan(Number(bid.price));
  });

  it('reads the side from the advertisement and not from the question asked', () => {
    // A response that came back with the other half of the book must fail
    // rather than be quoted into the wrong column.
    expect(() => parseStablecoinBook(askBook, 'BUY')).toThrow(/no BUY advertisement/u);
    expect(() => parseStablecoinBook(bidBook, 'SELL')).toThrow(/no SELL advertisement/u);
  });

  it('returns an excerpt that is a literal slice of the response', () => {
    const quote = parseStablecoinBook(askBook, 'SELL');

    // The excerpt is hashed and stored as the evidence for the value, so a
    // re-serialised object would differ from the bytes in key order or spacing
    // and the reading would fail its own grounding check.
    expect(askBook).toContain(quote.excerpt);
    expect(quote.excerpt).toContain('"price":"12.03"');
    expect(quote.excerpt.startsWith('{')).toBe(true);
    expect(quote.excerpt.endsWith('}')).toBe(true);
  });

  it('keeps the price exactly as the payload writes it', () => {
    const trailing = book(['11.90', '12.10', '12.500'], 'SELL');

    expect(parseStablecoinBook(trailing, 'SELL').price).toBe('12.10');
    expect(parseStablecoinBook(book(['12.500'], 'SELL'), 'SELL').price).toBe('12.500');
  });

  it('resolves an even count the way percentile_disc(0.5) does', () => {
    // The lower of the two middle advertisements, because percentile_disc takes
    // the first position that reaches half the book. Pinned by a test because
    // the read model recomputes this median in SQL: drifting by one position
    // would publish a price that disagrees with itself.
    expect(parseStablecoinBook(book(['11.00', '12.00'], 'SELL'), 'SELL').price).toBe('11.00');
    expect(parseStablecoinBook(book(['11.00', '12.00', '13.00'], 'SELL'), 'SELL').price).toBe(
      '12.00',
    );
    expect(
      parseStablecoinBook(book(['11.00', '12.00', '13.00', '14.00'], 'SELL'), 'SELL').price,
    ).toBe('12.00');
  });

  it('orders by price rather than trusting the order served', () => {
    const shuffled = book(['12.09', '11.99', '12.03', '12.00', '12.04'], 'SELL');

    expect(parseStablecoinBook(shuffled, 'SELL').price).toBe('12.03');
  });

  it('reports the breadth the exchange declared', () => {
    expect(parseStablecoinBook(askBook, 'SELL').advertisementsTotal).toBe(35);
    const untotalled = askBook.replace(',"total":35', '');
    expect(parseStablecoinBook(untotalled, 'SELL').advertisementsTotal).toBeNull();
  });

  it('refuses a book that mixes instruments', () => {
    const mixed = `{"data":[${advertisement('12.00', 'SELL', 'USDT')},${advertisement(
      '12.10',
      'SELL',
      'USDC',
    )}],"total":2}`;

    expect(() => parseStablecoinBook(mixed, 'SELL')).toThrow(/more than one instrument/u);
  });

  it('refuses a shapeless payload instead of inventing a price', () => {
    expect(() => parseStablecoinBook('{"code":"error"}', 'SELL')).toThrow(/no advertisement list/u);
  });

  it('tells an empty book apart from a broken one', () => {
    // La diferencia no es de estilo. Tres de las cinco fichas que el recolector
    // pide no tienen mercado en bolivianos, así que su libro vacío es el estado
    // real de ese mercado y llega cada corrida; tratarlo como fallo llenaría la
    // lista de errores de seis entradas permanentes y enterraría los fallos de
    // verdad. Por eso el libro vacío tiene su propio tipo de error, y el
    // recolector lo cuenta como ausencia observada en vez de como avería.
    expect(() => parseStablecoinBook('{"data":[],"total":0}', 'SELL', 'PYUSD')).toThrow(
      EmptyBookError,
    );
    expect(() => parseStablecoinBook('{"data":[],"total":0}', 'SELL', 'PYUSD')).toThrow(/PYUSD/u);

    // Un libro con avisos de un solo lado es la misma clase de ausencia: medio
    // libro no tiene punto medio, y eso es mercado, no avería.
    const oneSided = `{"data":[${advertisement('12.00', 'SELL', 'USDT')}],"total":1}`;
    expect(() => parseStablecoinBook(oneSided, 'BUY', 'USDT')).toThrow(EmptyBookError);

    // Y una respuesta ilegible NO es una ausencia: eso es la petición fallando.
    expect(() => parseStablecoinBook('{"code":"error"}', 'SELL', 'USDT')).not.toThrow(
      EmptyBookError,
    );
  });

  it('survives a brace inside an advertiser remark', () => {
    // The object is found by scanning braces, so a remark carrying one would
    // close it early and truncate the excerpt.
    const withBrace =
      `{"data":[{"adv":{"tradeType":"SELL","asset":"USDT","fiatUnit":"BOB",` +
      `"price":"12.00","remarks":"pago por QR {banco}"}}],"total":1}`;
    const quote = parseStablecoinBook(withBrace, 'SELL');

    expect(quote.price).toBe('12.00');
    expect(withBrace).toContain(quote.excerpt);
    expect(quote.excerpt).toContain('{banco}');
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
      stablecoinBookMeasure(parseStablecoinBook(book(['12.19'], 'BUY', 'USDC'), 'BUY')),
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
      parseStablecoinBook(book(['12.19'], 'SELL', 'USDC'), 'SELL'),
    );

    expect(usdc.unit).toBe(usdt.unit);
  });

  it('refuses a token that has no series rather than filing it somewhere', () => {
    const fdusd = parseStablecoinBook(book(['11.71'], 'SELL', 'FDUSD'), 'SELL');

    // FDUSD was checked on 2026-09-21 and has sell advertisements only, so it
    // gets no series: half a book is not a quotation.
    expect(() => stablecoinBookMeasure(fdusd)).toThrow(/No series is defined for FDUSD/u);
  });

  it('grounds the measured value in the excerpt it was read from', () => {
    const quote = parseStablecoinBook(askBook, 'SELL');

    expect(ungroundedMeasures([stablecoinBookMeasure(quote)], quote.excerpt)).toEqual([]);
  });
});
