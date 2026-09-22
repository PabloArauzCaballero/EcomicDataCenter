import type { BookSide } from './stablecoin-book-parsers';

/**
 * Las formas en que un libro no llega a tener un precio, que no son averías.
 *
 * Viven aparte del parser porque son la parte de este lector que el resto del
 * sistema tiene que distinguir: el recolector las cuenta como ausencias
 * observadas y sigue, mientras que cualquier otro error va a la lista de fallos
 * que alguien mira. De las fichas que se piden en cada corrida, varias devuelven
 * una de estas casi siempre, así que confundirlas con averías llenaría esa lista
 * de entradas permanentes y enterraría los fallos de verdad.
 */

/**
 * Raised when the exchange answered and the book it described is empty.
 *
 * Separated from every other failure because it is not one. A book with no
 * advertisements is a fact about the market — that token is not traded for
 * bolivianos today — while an unreadable payload is a fact about the request,
 * and the two must not end up in the same error list. The collector files this
 * one as an observed absence and keeps going; anything else it files as a
 * failure worth looking at.
 */
export class ThinBookError extends Error {
  constructor(
    readonly asset: string,
    readonly side: BookSide,
    readonly advertisementsRead: number,
  ) {
    super(`El libro de ${asset} solo tiene ${advertisementsRead} aviso(s) de ${side}`);
    this.name = 'ThinBookError';
  }
}

export class EmptyBookError extends Error {
  constructor(
    readonly asset: string,
    readonly side: BookSide,
  ) {
    super(`The boliviano book for ${asset} has no ${side} advertisement`);
    this.name = 'EmptyBookError';
  }
}
