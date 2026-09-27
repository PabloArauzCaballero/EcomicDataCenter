import { INDICATOR_CODES } from './indicator-measures';
import { EmptyBookError, ThinBookError } from './stablecoin-book-absences';

/**
 * Parser for a peer-to-peer order book quoted in bolivianos.
 *
 * The venue that served the parallel rate until now publishes one buy and one
 * sell figure per venue and nothing about the book behind them, and two of its
 * three venues quote USDT while the third quotes USD without saying which
 * dollar. That is enough for one aggregate series and not enough to answer
 * which stablecoin the country is actually paying for, so the book is read
 * directly from the exchange that lists both.
 *
 * Kept out of the collector for the same reason as the daily parsers: the
 * expressions that turn a downloaded book into a reading can then be exercised
 * against a captured payload with no network, no backend and no provider key.
 */

/**
 * Stablecoins whose boliviano book is read, with the series each one feeds.
 *
 * Five rather than two, and three of the five have never returned a single
 * advertisement. They are asked for anyway, every run, because the alternative
 * is worse than a wasted request: a token gets a boliviano market on some
 * Tuesday, nobody notices for a month, and the series starts a month late with
 * its opening weeks lost for good. The request costs one round trip and the
 * empty answer is recorded as what it is — a market that does not exist today,
 * not a collector that failed.
 *
 * `STABLECOIN_MARKET_SURVEY` says what each book held when it was last counted.
 * This list says what gets asked. They are deliberately separate: the census is
 * a statement about a day, and the asking must not depend on it.
 */
export const STABLECOIN_SERIES = {
  USDT: INDICATOR_CODES.parallelExchangeRateUsdt,
  USDC: INDICATOR_CODES.parallelExchangeRateUsdc,
  USDS: INDICATOR_CODES.parallelExchangeRateUsds,
  USDE: INDICATOR_CODES.parallelExchangeRateUsde,
  PYUSD: INDICATOR_CODES.parallelExchangeRatePyusd,
  /*
   * Entró el 2026-09-22, el día que su libro dejó de tener un solo lado.
   *
   * Es la regla de arriba cumpliéndose en vivo: se pedían cinco fichas, tres de
   * ellas sin mercado, precisamente para que una que abriera no perdiera sus
   * primeras jornadas. Esta abrió con tres avisos en total, que es poquísimo, y
   * esa delgadez viaja con el dato —`venue_count` y el número de avisos leídos—
   * en vez de decidir por el lector si mirarlo o no.
   */
  FDUSD: INDICATOR_CODES.parallelExchangeRateFdusd,
} as const;

export type StablecoinAsset = keyof typeof STABLECOIN_SERIES;

/**
 * Side of the book, named as a Bolivian reader names it.
 *
 * `SELL` is the price at which the market sells a dollar to the reader — the
 * "venta" of a casa de cambio, the higher number, what they pay. `BUY` is the
 * price at which the market buys one from them.
 *
 * Two labels are in play and they do not agree, which is exactly the confusion
 * the previous source never resolved. The **query** is phrased from the
 * reader's position, so asking for the reader's `SELL` side means asking the
 * exchange for `tradeType: BUY` — "I want to buy". The **advertisement** that
 * comes back is labelled from its publisher's position, and a publisher who is
 * selling is selling *to the reader*: `adv.tradeType` is `SELL`, which is the
 * reader's side again. So the request inverts and the advertisement does not,
 * and the side is resolved against the advertisement's own field rather than
 * against the question that was asked.
 */
export type BookSide = 'BUY' | 'SELL';

/**
 * What the exchange must be asked for to obtain each side of the book.
 *
 * Inverted with respect to the side, because the query speaks for the reader:
 * to see what the reader would pay, ask for the advertisements they could buy
 * from.
 */
export const BOOK_SIDE_REQUEST: Readonly<Record<BookSide, 'BUY' | 'SELL'>> = {
  BUY: 'SELL',
  SELL: 'BUY',
};

/**
 * How many advertisements of a side are read.
 *
 * The figure is part of the method rather than a tuning knob: the quotation is
 * the median of the advertisements read, so changing it changes the series.
 */
export const BOOK_DEPTH = 20;

/**
 * Cuántos avisos necesita un lado para que su mediana sea una mediana.
 *
 * La cifra publicada es la mediana discreta de los avisos leídos, y la mediana
 * de un aviso es ese aviso: el precio que pidió una persona, no el del mercado.
 *
 * No es una precaución teórica. El 2026-09-22 el libro de FDUSD tenía un aviso
 * de venta a 13,30 y dos de compra a 7,00, con lo que su punto medio habría
 * salido 10,15 y el panel habría dicho que por ese riel el dólar cuesta diez
 * bolivianos mientras los demás decían doce. Tres es el primer número con el
 * que la mediana descarta algo.
 */
export const MINIMUM_BOOK_DEPTH = 3;

export { EmptyBookError, ThinBookError } from './stablecoin-book-absences';

export interface StablecoinBookQuote {
  /** Literal slice of the response body, quoted verbatim as evidence. */
  excerpt: string;
  /** Stablecoin leg, as the payload spells it. */
  asset: string;
  /** Fiat leg, as the payload spells it. */
  fiat: string;
  /** Side in the reader's terms, resolved from the advertisement's own label. */
  side: BookSide;
  /** Label the advertisement carries, retained so the inversion stays checkable. */
  advertisedTradeType: string;
  /** Price exactly as written in the payload, never re-formatted. */
  price: string;
  /** Best price the side showed, for the run report rather than for publication. */
  bestPrice: string;
  /** How many advertisements this side of the book was read from. */
  advertisementsRead: number;
  /** How many the exchange said exist, which is the side's breadth. */
  advertisementsTotal: number | null;
}

interface RawAdvertisement {
  price: string;
  tradeType: string;
  asset: string;
  fiatUnit: string;
  /** Where the advertisement's object begins and ends in the response text. */
  start: number;
  end: number;
}

/**
 * Locates each advertisement object in the response text.
 *
 * The objects are found by scanning braces rather than by re-serialising the
 * parsed value, because the excerpt retained as evidence has to be a slice of
 * the bytes that were hashed: a re-serialised object would differ from the
 * response in key order and spacing and would fail its own grounding check.
 */
function locateAdvertisements(text: string, asset: string, side: BookSide): RawAdvertisement[] {
  const parsed = JSON.parse(text) as {
    data?: unknown;
  };
  if (!Array.isArray(parsed.data))
    throw new Error('Exchange payload exposed no advertisement list');
  /*
   * An empty list is the exchange answering that nobody is quoting this token
   * for bolivianos. It is reported as an absence rather than as a fault: the
   * request worked, the payload parsed, and the market is what it is.
   */
  if (!parsed.data.length) throw new EmptyBookError(asset, side);

  const found: RawAdvertisement[] = [];
  let cursor = 0;
  for (const entry of parsed.data) {
    const advertisement = (entry as { adv?: Record<string, unknown> }).adv;
    if (!advertisement) continue;
    const { price, tradeType, asset, fiatUnit } = advertisement;
    if (
      typeof price !== 'string' ||
      typeof tradeType !== 'string' ||
      typeof asset !== 'string' ||
      typeof fiatUnit !== 'string'
    ) {
      continue;
    }
    const marker = text.indexOf('"adv"', cursor);
    if (marker < 0) break;
    const open = text.indexOf('{', marker);
    if (open < 0) break;
    let depth = 0;
    let close = -1;
    for (let index = open; index < text.length; index += 1) {
      const character = text[index];
      if (character === '"') {
        // Skip the string so a brace inside a remark cannot close the object.
        index += 1;
        while (index < text.length && text[index] !== '"') {
          index += text[index] === '\\' ? 2 : 1;
        }
        continue;
      }
      if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          close = index + 1;
          break;
        }
      }
    }
    if (close < 0) break;
    found.push({ price, tradeType, asset, fiatUnit, start: open, end: close });
    cursor = close;
  }
  if (!found.length) throw new Error('Exchange payload exposed no readable advertisement');
  return found;
}

/**
 * Reads one side of one stablecoin's boliviano book.
 *
 * The published figure is the **discrete median** of the advertisements read,
 * for the same two reasons the cross-venue figure is: it resists a single
 * advertiser posting far away from the rest, and it returns a price somebody
 * actually offered rather than an average nobody quoted. Top of book would be
 * neither — in this market the best bid regularly sits above the best ask,
 * because the two are reachable through different payment rails and at
 * different fees, so the headline pair of a peer-to-peer book is not a spread
 * and cannot be read as one.
 */
export function parseStablecoinBook(
  text: string,
  side: BookSide,
  asset = 'this token',
): StablecoinBookQuote {
  const advertisements = locateAdvertisements(text, asset, side);
  /*
   * The advertisement's own label, which coincides with the reader's side. A
   * response whose advertisements carry the other label is the wrong half of
   * the book, and that is worth failing on rather than quoting: it would put
   * the price the reader receives in the column that says what they pay.
   */
  const ofSide = advertisements.filter(
    (advertisement) => advertisement.tradeType.toLocaleUpperCase('en') === side,
  );
  if (!ofSide.length) {
    /*
     * The book carried advertisements and none of them is this side's. On a
     * thin token that is the market again — a token quoted in one direction
     * only has no mid-point — so it is filed as an absence rather than as a
     * fault, for the same reason an empty list is.
     */
    throw new EmptyBookError(asset, side);
  }

  const assets = new Set(ofSide.map((advertisement) => advertisement.asset));
  const fiats = new Set(ofSide.map((advertisement) => advertisement.fiatUnit));
  if (assets.size !== 1 || fiats.size !== 1) {
    throw new Error('Exchange book mixed more than one instrument');
  }

  const priced = [...ofSide].sort(
    (left, right) => Number(left.price) - Number(right.price) || left.start - right.start,
  );
  if (priced.some((advertisement) => !Number.isFinite(Number(advertisement.price)))) {
    throw new Error('Exchange advertisement carried a price that is not a number');
  }

  /*
   * Discrete median, defined as `percentile_disc(0.5)` defines it: the first
   * advertisement whose position in the ordering reaches half the book, which
   * is the ⌈n/2⌉-th and therefore the *lower* of the two middle ones on an even
   * count. Stated as the index rather than as "the middle" because the two
   * differ, and matching the database's definition exactly is the point: the
   * same figure is recomputed there by the read model, and a median that drifted
   * by one position between the two would publish a price that disagrees with
   * itself.
   */
  /*
   * Un lado con dos avisos no tiene mediana, tiene dos precios. Se trata como
   * las demás ausencias —no hay precio hoy— y no como avería.
   */
  if (priced.length < MINIMUM_BOOK_DEPTH) {
    throw new ThinBookError(asset, side, priced.length);
  }

  const median = priced[Math.ceil(priced.length / 2) - 1];
  if (!median) throw new Error('Exchange book collapsed while being read');

  /*
   * The best price is the lowest of the asks and the highest of the bids: the
   * most favourable advertisement for whoever is on the reader's side.
   */
  const best = side === 'SELL' ? priced[0] : priced.at(-1);

  const total = (JSON.parse(text) as { total?: unknown }).total;

  return {
    excerpt: text.slice(median.start, median.end),
    asset: median.asset,
    fiat: median.fiatUnit,
    side,
    advertisedTradeType: median.tradeType,
    price: median.price,
    bestPrice: best?.price ?? median.price,
    advertisementsRead: ofSide.length,
    advertisementsTotal: typeof total === 'number' ? total : null,
  };
}
