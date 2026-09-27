import { INDICATOR_UNITS, type IndicatorMeasure } from './indicator-measures';
import {
  STABLECOIN_SERIES,
  type StablecoinAsset,
  type StablecoinBookQuote,
} from './stablecoin-book-parsers';

/**
 * En qué se convierte una lectura del libro: título, afirmación y medida.
 *
 * Separado del parser por la misma razón por la que el parser está separado del
 * recolector. Leer un libro y convertir esa lectura en una afirmación citable
 * son dos trabajos con dos maneras distintas de fallar: el primero se rompe
 * cuando la bolsa cambia la forma de su respuesta, el segundo cuando cambia lo
 * que la ingesta exige de una afirmación —y ese segundo fallo ya ocurrió una
 * vez, en silencio y durante días—. Los dos se comprueban contra el mismo
 * payload capturado, sin red y sin base de datos.
 */

/**
 * Título de una lectura del libro, que tiene que poder citarse de la respuesta.
 *
 * La validación previa a la ingesta exige que el título aparezca literal en el
 * documento descargado, y con razón: un título que no está en la fuente es un
 * título inventado. El libro escribe la ficha y el fiat en campos separados
 * —`"asset":"USDT"`, `"fiatUnit":"BOB"`— y no junta los dos en ninguna cadena,
 * así que el par «USDT/BOB» no es citable por mucho que describa mejor la
 * lectura. Se titula con la ficha tal como la deletrea el libro; el par viaja
 * en `instrument`, que no se cita, y el lado y el precio van en la afirmación.
 *
 * Se comprueba contra el mismo payload capturado que el parser: cuando el
 * título era el par, las lecturas se rechazaban en cada corrida sin que
 * ninguna prueba lo notara.
 */
export function stablecoinBookTitle(quote: StablecoinBookQuote): string {
  return quote.asset;
}

/**
 * Wording for a book quotation.
 *
 * Built out of the payload's own field names for the reason the venue wording
 * already is: a fully prose rendering of a JSON body shares too few terms with
 * it to clear the lexical grounding threshold, and every reading would be
 * routed to human review instead of publishing. The only figure stated is the
 * price, because it is the only one the cited advertisement contains.
 */
export function stablecoinBookAssertion(quote: StablecoinBookQuote): string {
  const reading = quote.side === 'SELL' ? 'venta al lector' : 'compra al lector';
  return (
    `Dolar paralelo asset ${quote.asset} fiatUnit ${quote.fiat} ` +
    `tradeType ${quote.advertisedTradeType} (${reading}): price ${quote.price}.`
  );
}

/**
 * Measurement for one side of one stablecoin's book.
 *
 * The unit stays bolivianos per dollar rather than bolivianos per token. The
 * series exists precisely to show whether that equivalence holds — a USDC that
 * costs more bolivianos than a USDT is the price of the rail, not of a
 * different dollar — and quoting the two in different units would put them on
 * separate axes and hide the comparison the series was added to make.
 */
export function stablecoinBookMeasure(quote: StablecoinBookQuote): IndicatorMeasure {
  const asset = quote.asset.toLocaleUpperCase('en') as StablecoinAsset;
  const indicatorCode = STABLECOIN_SERIES[asset];
  if (!indicatorCode) throw new Error(`No series is defined for ${quote.asset}`);
  return {
    indicatorCode,
    priceSide: quote.side,
    value: quote.price,
    unit: INDICATOR_UNITS.bolivianosPerDollar,
  };
}
