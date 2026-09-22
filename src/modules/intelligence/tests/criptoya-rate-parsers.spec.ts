import {
  PairNotQuotedError,
  criptoyaAssertion,
  criptoyaSidePrice,
  criptoyaTitle,
  parseCriptoyaRates,
} from '../criptoya-rate-parsers';
import { assessLexicalGrounding } from '../claim-evidence-grounding';
import { ungroundedNumbers } from '../../../common/intelligence/quantitative-grounding';

/**
 * Capturado del agregador el 2026-09-22 para USDC contra el boliviano, con las
 * cinco plazas que devolvió y sus cifras tal cual. Nada se ha limpiado: dos de
 * ellas traen `"ask":0` y una compra a 9,5 cuando el resto ronda 12, que es
 * precisamente lo que estas pruebas existen para que no entre.
 */
/** El instante de la captura, para que estas pruebas no caduquen con el reloj. */
const CAPTURED_AT = new Date(1790086000 * 1000);

/** Un sello fresco respecto de `CAPTURED_AT`, para los cuerpos armados a mano. */
const FRESH = Math.floor(CAPTURED_AT.getTime() / 1000) - 60;

const PAYLOAD =
  `{"vitawallet":{"ask":12.3131,"totalAsk":12.3131,"bid":12.056,"totalBid":12.056,"time":1790084809},` +
  `"vibrant":{"ask":12.677,"totalAsk":12.677,"bid":11.754,"totalBid":11.754,"time":1790084808},` +
  `"bybitp2p":{"ask":12.5,"totalAsk":12.5,"bid":11.75,"totalBid":11.75,"time":1790077333},` +
  `"bitgetp2p":{"ask":0,"totalAsk":0,"bid":9.5,"totalBid":9.5,"time":1790077373},` +
  `"mexcp2p":{"ask":0,"totalAsk":0,"bid":9.51,"totalBid":9.51,"time":1790077364}}`;

describe('parseCriptoyaRates', () => {
  it('se queda con las plazas que cotizan los dos lados', () => {
    const { quotes } = parseCriptoyaRates(PAYLOAD, 'USDC', CAPTURED_AT);

    expect(quotes.map((quote) => quote.venue)).toEqual(['vitawallet', 'vibrant', 'bybitp2p']);
  });

  it('descarta un cero en vez de publicarlo como precio', () => {
    // La trampa de esta fuente, y no es teorica: dos de las cinco plazas que
    // cotizan USDC devuelven `"ask":0`. En JSON el cero ES un numero, asi que
    // un lector que solo comprobara que el campo existe publicaria un dolar a
    // cero bolivianos y el modelo promediaria ese cero con el otro lado hasta
    // dar un punto medio a mitad de precio.
    const { rejected } = parseCriptoyaRates(PAYLOAD, 'USDC', CAPTURED_AT);

    expect(rejected.bitgetp2p).toBe('MISSING_SIDE');
    expect(rejected.mexcp2p).toBe('MISSING_SIDE');
    expect(JSON.stringify(parseCriptoyaRates(PAYLOAD, 'USDC', CAPTURED_AT).quotes)).not.toContain(
      '"ask":"0"',
    );
  });

  it('descarta una cotizacion cruzada dentro de una misma plaza', () => {
    // No confundir con el libro P2P cruzado que documenta el parser de al lado:
    // alli el cruce es entre rieles de pago distintos y es real. Aqui las dos
    // cifras son de la misma plaza, y que compre mas caro de lo que vende no es
    // un diferencial sino un dato malo.
    const crossed = `{"plaza":{"ask":11.90,"totalAsk":11.90,"bid":12.40,"totalBid":12.40,"time":${FRESH}}}`;

    expect(() => parseCriptoyaRates(crossed, 'USDC', CAPTURED_AT)).toThrow(/Ninguna plaza/u);
    // Y con una buena al lado, cae solo la cruzada.
    const mixed = `{"buena":{"ask":12.30,"bid":12.00,"time":${FRESH}},"cruzada":{"ask":11.90,"bid":12.40,"time":${FRESH}}}`;
    const { quotes, rejected } = parseCriptoyaRates(mixed, 'USDC', CAPTURED_AT);
    expect(quotes.map((quote) => quote.venue)).toEqual(['buena']);
    expect(rejected.cruzada).toBe('CROSSED_QUOTE');
  });

  it('no toma la plaza cuyo libro ya se lee directo', () => {
    // Tomar las dos haria pesar esa plaza el doble en la mediana entre plazas,
    // que es justo lo que la mediana entre plazas existe para evitar.
    const withBinance = `{"binancep2p":{"ask":12.26,"bid":12.22,"time":${FRESH}},"otra":{"ask":12.30,"bid":12.00,"time":${FRESH}}}`;
    const { quotes, rejected } = parseCriptoyaRates(withBinance, 'USDC', CAPTURED_AT);

    expect(quotes.map((quote) => quote.venue)).toEqual(['otra']);
    expect(rejected.binancep2p).toBe('ALREADY_READ_DIRECTLY');
  });

  it('descarta una cotizacion vieja en vez de archivarla como la de hoy', () => {
    // Caso real, no inventado: el 2026-09-22 este agregador seguia publicando
    // DAI contra el boliviano con un sello de veintiocho dias antes, con el
    // mismo aspecto que una cotizacion de hace un minuto. Archivada como el
    // precio de hoy, una serie diaria repetiria un dia muerto indefinidamente
    // sin que nada lo dijera.
    const now = new Date(1790086000 * 1000);
    const stale = `{"saldo":{"ask":11.862,"totalAsk":11.862,"bid":11.538,"totalBid":11.538,"time":1787682567}}`;

    expect(() => parseCriptoyaRates(stale, 'DAI', now)).toThrow(/Ninguna plaza/u);
    const mixed = `{"fresca":{"ask":12.30,"bid":12.00,"time":1790085000},` + stale.slice(1);
    const { quotes, rejected } = parseCriptoyaRates(mixed, 'DAI', now);
    expect(quotes.map((quote) => quote.venue)).toEqual(['fresca']);
    expect(rejected.saldo).toBe('STALE_QUOTE');
  });

  it('descarta una plaza que no dice cuando miro', () => {
    // El valor de esta fuente es que sella cada cotizacion. Sin sello no se
    // puede afirmar que el precio sea el de la fecha con la que se archiva.
    const undated = `{"plaza":{"ask":12.30,"bid":12.00}}`;

    expect(() => parseCriptoyaRates(undated, 'USDC')).toThrow(/Ninguna plaza/u);
    expect(
      parseCriptoyaRates(
        `{"a":{"ask":12.3,"bid":12,"time":0},"b":{"ask":12.3,"bid":12,"time":${Math.floor(Date.now() / 1000)}}}`,
        'USDC',
      ).rejected.a,
    ).toBe('STALE_QUOTE');
  });

  it('cita bytes que estan literalmente en la respuesta', () => {
    const { quotes } = parseCriptoyaRates(PAYLOAD, 'USDC', CAPTURED_AT);

    for (const quote of quotes) {
      expect(PAYLOAD).toContain(quote.excerpt);
      expect(quote.excerpt.startsWith(`"${quote.venue}":`)).toBe(true);
    }
  });

  it('pone la venta por encima de la compra, en los terminos del lector', () => {
    const [vitawallet] = parseCriptoyaRates(PAYLOAD, 'USDC', CAPTURED_AT).quotes;
    if (!vitawallet) throw new Error('faltó la plaza de la prueba');

    expect(criptoyaSidePrice(vitawallet, 'SELL')).toBe('12.3131');
    expect(criptoyaSidePrice(vitawallet, 'BUY')).toBe('12.056');
    expect(Number(criptoyaSidePrice(vitawallet, 'SELL'))).toBeGreaterThan(
      Number(criptoyaSidePrice(vitawallet, 'BUY')),
    );
  });

  it('distingue «no cotizo ese par» de un cuerpo roto', () => {
    // Tres de las cinco fichas que se piden no se negocian en bolivianos en
    // ninguna parte, asi que esta respuesta llega en cada corrida. Tratarla
    // como error llenaria la lista de fallos de entradas permanentes que
    // enterrarian los fallos de verdad, que es el mismo motivo por el que el
    // libro vacio de la bolsa tiene su propio tipo de error.
    //
    // Llega de dos formas y las dos significan lo mismo.
    expect(() => parseCriptoyaRates('[]', 'PYUSD')).toThrow(PairNotQuotedError);
    expect(() => parseCriptoyaRates('{"error":"Invalid pair"}', 'USDE')).toThrow(
      PairNotQuotedError,
    );
    expect(() => parseCriptoyaRates('{}', 'USDS')).toThrow(PairNotQuotedError);

    // Y lo que sí es un cuerpo roto no se confunde con una ausencia.
    expect(() => parseCriptoyaRates('"12.30"', 'USDC')).toThrow(/mapa de plazas/u);
    expect(() => parseCriptoyaRates('{"plaza":"12.30"}', 'USDC')).not.toThrow(PairNotQuotedError);
    expect(() => parseCriptoyaRates('{"plaza":"12.30"}', 'USDC')).toThrow(/Ninguna plaza/u);
  });
});

describe('criptoyaTitle y criptoyaAssertion', () => {
  it('titula con algo que esta en la respuesta', () => {
    // La ficha no esta en el cuerpo, va en la direccion, asi que lo unico
    // citable es el nombre de la plaza. Esta prueba existe porque la misma
    // regla ya se incumplio una vez en el lector del libro P2P, en silencio y
    // durante dias.
    for (const quote of parseCriptoyaRates(PAYLOAD, 'USDC', CAPTURED_AT).quotes) {
      expect(PAYLOAD).toContain(criptoyaTitle(quote));
    }
  });

  it('se ancla en su propio extracto y no enuncia cifras sin respaldo', () => {
    // Medido, no supuesto: el anclaje exige que la mitad de los terminos de la
    // afirmacion esten en el extracto, y el extracto de esta fuente son seis
    // campos, no el aviso de kilobytes del libro P2P. Una redaccion en prosa
    // daba dos terminos sobre once y caia a LIMITED, que enruta a revision.
    for (const quote of parseCriptoyaRates(PAYLOAD, 'USDC', CAPTURED_AT).quotes) {
      for (const side of ['SELL', 'BUY'] as const) {
        const assertion = criptoyaAssertion(quote, 'USDC', side);
        expect(ungroundedNumbers(assertion, quote.excerpt)).toEqual([]);
        expect(assessLexicalGrounding(assertion, quote.excerpt).status).toBe('SUPPORTED');
      }
    }
  });

  it('redacta cada lado distinto, porque la huella del hecho se calcula del texto', () => {
    // La huella de contenido sale de tipo, afirmacion y fecha. Dos lados de una
    // misma plaza con el mismo texto serian el mismo hecho, y uno desplazaria
    // al otro sin que nada lo dijera.
    const seen = new Set<string>();
    for (const quote of parseCriptoyaRates(PAYLOAD, 'USDC', CAPTURED_AT).quotes) {
      for (const side of ['SELL', 'BUY'] as const) {
        seen.add(criptoyaAssertion(quote, 'USDC', side));
      }
    }

    expect(seen.size).toBe(parseCriptoyaRates(PAYLOAD, 'USDC', CAPTURED_AT).quotes.length * 2);
  });
});
