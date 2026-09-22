import {
  BOOK_SIDE_REQUEST,
  EmptyBookError,
  ThinBookError,
  parseStablecoinBook,
} from '../stablecoin-book-parsers';

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
    expect(parseStablecoinBook(book(['12.500', '12.500', '12.500'], 'SELL'), 'SELL').price).toBe(
      '12.500',
    );
  });

  it('resolves an even count the way percentile_disc(0.5) does', () => {
    // The lower of the two middle advertisements, because percentile_disc takes
    // the first position that reaches half the book. Pinned by a test because
    // the read model recomputes this median in SQL: drifting by one position
    // would publish a price that disagrees with itself.
    expect(
      parseStablecoinBook(book(['11.00', '11.00', '12.00', '12.00'], 'SELL'), 'SELL').price,
    ).toBe('11.00');
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

  it('no llama mediana a uno o dos avisos', () => {
    // Caso real del 2026-09-22: el libro de FDUSD tenia UN aviso de venta a
    // 13,30 y DOS de compra a 7,00. Publicarlo habria dado un punto medio de
    // 10,15, y el panel habria dicho que por ese riel el dolar cuesta diez
    // bolivianos mientras los demas decian doce. La mediana de un aviso es ese
    // aviso: el precio que pidio una persona, no el del mercado.
    expect(() => parseStablecoinBook(book(['13.30'], 'SELL', 'FDUSD'), 'SELL', 'FDUSD')).toThrow(
      ThinBookError,
    );
    expect(() =>
      parseStablecoinBook(book(['7.00', '7.00'], 'BUY', 'FDUSD'), 'BUY', 'FDUSD'),
    ).toThrow(ThinBookError);

    // Con tres ya hay algo que medianar.
    expect(
      parseStablecoinBook(book(['12.00', '12.10', '12.20'], 'SELL', 'FDUSD'), 'SELL', 'FDUSD')
        .price,
    ).toBe('12.10');
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
    const oneSided =
      `{"data":[${advertisement('12.00', 'SELL', 'USDT')},` +
      `${advertisement('12.01', 'SELL', 'USDT')},` +
      `${advertisement('12.02', 'SELL', 'USDT')}],"total":3}`;
    expect(() => parseStablecoinBook(oneSided, 'BUY', 'USDT')).toThrow(EmptyBookError);

    // Y una respuesta ilegible NO es una ausencia: eso es la petición fallando.
    expect(() => parseStablecoinBook('{"code":"error"}', 'SELL', 'USDT')).not.toThrow(
      EmptyBookError,
    );
  });

  it('survives a brace inside an advertiser remark', () => {
    // The object is found by scanning braces, so a remark carrying one would
    // close it early and truncate the excerpt.
    // El aviso con el corchete tiene que caer en la mediana, que es el que se
    // cita: con tres avisos, el del medio por precio.
    const withBrace =
      `{"data":[${advertisement('11.99', 'SELL')},` +
      `{"adv":{"tradeType":"SELL","asset":"USDT","fiatUnit":"BOB",` +
      `"price":"12.00","remarks":"pago por QR {banco}"}},` +
      `${advertisement('12.01', 'SELL')}],"total":3}`;
    const quote = parseStablecoinBook(withBrace, 'SELL');

    expect(quote.price).toBe('12.00');
    expect(withBrace).toContain(quote.excerpt);
    expect(quote.excerpt).toContain('{banco}');
  });
});
