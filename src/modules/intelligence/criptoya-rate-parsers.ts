/**
 * Lector del agregador que publica una ficha estable contra el boliviano en
 * varias plazas a la vez.
 *
 * Existe por un defecto concreto de la serie por ficha: USDC se leía de **una
 * sola plaza**, porque es la única con libro entre particulares en bolivianos
 * para esa ficha. Una mediana entre plazas con una sola plaza no es una
 * mediana, es esa plaza —y el modelo de lectura publica `venue_count` = 1 para
 * decirlo—. Este agregador cotiza la misma ficha en billeteras y bolsas que no
 * tienen libro P2P propio, así que la cifra diaria pasa a apoyarse en varias.
 *
 * Lo que **no** hace es dar historia. Publica el precio de ahora y nada más;
 * la serie por ficha sigue empezando el día que el recolector empezó a
 * nombrarla. Eso no lo arregla ninguna fuente que hayamos encontrado.
 */

/** Lado del libro en los términos del lector, igual que en el parser del P2P. */
export type RateSide = 'BUY' | 'SELL';

/**
 * Plazas que **no** se toman de aquí porque ya se leen directas.
 *
 * El libro de la bolsa se lee de la bolsa: trae profundidad, número de avisos y
 * un extracto que es el aviso mismo, y de aquí vendría un único par de cifras
 * ya resumido. Tomar las dos haría pesar esa plaza el doble en la mediana entre
 * plazas, que es justo lo que la mediana entre plazas existe para evitar.
 */
const READ_DIRECTLY = new Set(['binancep2p']);

/**
 * Cuánto puede tener una cotización antes de dejar de ser la de hoy.
 *
 * No es una precaución teórica. Este agregador sigue publicando plazas que
 * dejaron de actualizar: la cotización de DAI contra el boliviano llevaba
 * **veintiocho días** parada el 2026-09-22 y llegaba con el mismo aspecto que
 * una de hace un minuto. Sin esta guarda, ese precio viejo se archivaría como
 * el precio de hoy, y una serie diaria construida así repetiría un día muerto
 * indefinidamente sin que nada lo dijera.
 *
 * Un día, que es la granularidad de la serie: una lectura sellada ayer sigue
 * siendo defendible como punto de hoy; una de la semana pasada, no.
 */
const STALE_AFTER_SECONDS = 24 * 60 * 60;

/** Una cotización utilizable de una plaza, ya resueltos los dos lados. */
export interface CriptoyaQuote {
  /** La plaza como la deletrea la respuesta, que es lo que se cita. */
  venue: string;
  /** Porción literal de la respuesta: el objeto de esta plaza, con su clave. */
  excerpt: string;
  /** Precio al que el mercado le vende un dólar al lector. El número alto. */
  ask: string;
  /** Precio al que el mercado se lo compra. El número bajo. */
  bid: string;
  /** Instante que la propia plaza declara, en segundos. */
  time: number;
}

/** Por qué se descartó una plaza. Se registra: una ausencia medida es un dato. */
export type CriptoyaRejection =
  'ALREADY_READ_DIRECTLY' | 'MISSING_SIDE' | 'CROSSED_QUOTE' | 'STALE_QUOTE' | 'MALFORMED';

/**
 * El agregador no cotiza esta ficha contra este fiat.
 *
 * Separado de cualquier otro fallo por la misma razón que el libro vacío de la
 * bolsa: no es una avería, es el mercado. De las cinco fichas que se piden,
 * tres no se negocian en bolivianos en ninguna parte, así que esta respuesta
 * llega en cada corrida y tratarla como error llenaría la lista de fallos de
 * entradas permanentes que enterrarían los fallos de verdad.
 *
 * Llega de dos formas distintas y las dos significan lo mismo: una lista vacía
 * con código 200, o un 422 diciendo que el par no existe.
 */
export class PairNotQuotedError extends Error {
  constructor(readonly asset: string) {
    super(`El agregador no cotiza ${asset} contra el boliviano`);
    this.name = 'PairNotQuotedError';
  }
}

export interface CriptoyaReading {
  quotes: CriptoyaQuote[];
  rejected: Record<string, CriptoyaRejection>;
}

/**
 * Un precio utilizable, o nada.
 *
 * El cero es la trampa de esta fuente y no es teórica: dos de las cinco plazas
 * que cotizan USDC devuelven `"ask":0`. En JSON un cero **es** un número, así
 * que un lector que solo compruebe que el campo existe publicaría un dólar a
 * cero bolivianos, y el modelo de lectura lo promediaría con el otro lado hasta
 * dar un punto medio a mitad de precio. Un cero aquí significa «esta plaza no
 * cotiza este lado», y se trata como lo que significa.
 */
function usablePrice(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * Recorta el objeto de una plaza del texto, con su clave por delante.
 *
 * Por corte del texto y no reserializando, por la misma razón que en el libro
 * P2P: los bytes citados como prueba tienen que ser los bytes que se leyeron.
 * Un objeto reconstruido diferiría en orden de claves y espaciado y fallaría su
 * propia comprobación de anclaje.
 */
function sliceVenue(text: string, venue: string): string | null {
  const marker = `"${venue}":`;
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const open = text.indexOf('{', start);
  if (open < 0) return null;
  const close = text.indexOf('}', open);
  if (close < 0) return null;
  return text.slice(start, close + 1);
}

/**
 * Lee la respuesta del agregador y devuelve las plazas utilizables.
 *
 * Tres reglas de descarte, todas por el mismo principio: media cotización no es
 * un precio.
 *
 * 1. **Falta un lado** —o vale cero—: sin los dos no hay punto medio, que es
 *    exactamente lo que el modelo de lectura exige de una plaza antes de
 *    dejarla entrar en la mediana.
 * 2. **Cotización cruzada** dentro de una misma plaza: que compre más caro de
 *    lo que vende no es un diferencial, es un dato malo. Ojo con no confundirlo
 *    con el libro P2P cruzado que documenta el parser de al lado: allí el cruce
 *    es *entre* rieles de pago distintos y es real; aquí las dos cifras son de
 *    la misma plaza y el cruce no puede serlo.
 * 3. **Malformada**: cualquier cosa que no sean dos números.
 *
 * Y una cuarta que no es descarte sino reparto: las plazas que ya se leen
 * directas no se toman de aquí.
 */
export function parseCriptoyaRates(
  text: string,
  asset = 'esta ficha',
  now: Date = new Date(),
): CriptoyaReading {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const parsed: unknown = JSON.parse(text);
  // Una lista vacía es como este agregador dice «no cotizo ese par».
  if (Array.isArray(parsed) && !parsed.length) throw new PairNotQuotedError(asset);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('El agregador no devolvió un mapa de plazas');
  }
  if (typeof (parsed as { error?: unknown }).error === 'string') {
    throw new PairNotQuotedError(asset);
  }
  if (!Object.keys(parsed).length) {
    throw new PairNotQuotedError(asset);
  }

  const quotes: CriptoyaQuote[] = [];
  const rejected: Record<string, CriptoyaRejection> = {};

  for (const [venue, raw] of Object.entries(parsed as Record<string, unknown>)) {
    if (READ_DIRECTLY.has(venue)) {
      rejected[venue] = 'ALREADY_READ_DIRECTLY';
      continue;
    }
    if (!raw || typeof raw !== 'object') {
      rejected[venue] = 'MALFORMED';
      continue;
    }
    const entry = raw as Record<string, unknown>;
    const ask = usablePrice(entry.ask);
    const bid = usablePrice(entry.bid);
    if (ask === null || bid === null) {
      rejected[venue] = 'MISSING_SIDE';
      continue;
    }
    if (bid > ask) {
      rejected[venue] = 'CROSSED_QUOTE';
      continue;
    }
    const excerpt = sliceVenue(text, venue);
    if (!excerpt) {
      rejected[venue] = 'MALFORMED';
      continue;
    }
    /*
     * El instante que la plaza declara, y sin él no se publica.
     *
     * Esta fuente vale porque dice cuándo miró. Una plaza que no lo diga no se
     * puede comprobar, y una que lo diga viejo no está cotizando hoy: las dos
     * se descartan por el mismo motivo, que es no poder afirmar que el precio
     * es el de la fecha con la que se archivaría.
     */
    const time = typeof entry.time === 'number' && Number.isFinite(entry.time) ? entry.time : 0;
    if (time <= 0 || nowSeconds - time > STALE_AFTER_SECONDS) {
      rejected[venue] = 'STALE_QUOTE';
      continue;
    }
    quotes.push({ venue, excerpt, ask: String(ask), bid: String(bid), time });
  }

  if (!quotes.length) throw new Error('Ninguna plaza del agregador quedó utilizable');
  return { quotes, rejected };
}

/** El precio de un lado, en los términos del lector. */
export function criptoyaSidePrice(quote: CriptoyaQuote, side: RateSide): string {
  return side === 'SELL' ? quote.ask : quote.bid;
}

/**
 * Título de la lectura, que tiene que poder citarse de la respuesta.
 *
 * La ficha no está en el cuerpo —va en la dirección— así que lo único citable
 * es el nombre de la plaza, y es lo que se usa. El par viaja en `instrument`,
 * que no se cita, igual que en el lector del libro P2P.
 */
export function criptoyaTitle(quote: CriptoyaQuote): string {
  return quote.venue;
}

/**
 * Redacción de la lectura.
 *
 * Construida con los nombres de campo de la propia respuesta, y aquí eso no es
 * estilo sino requisito medible: el anclaje léxico exige que **la mitad** de los
 * términos de la afirmación aparezcan en el extracto citado, y el extracto de
 * esta fuente es un objeto de seis campos, no el aviso de kilobytes del libro
 * P2P. Una redacción en prosa —«el dólar paralelo se cotizó en…»— da una
 * cobertura de dos términos sobre once, cae a LIMITED y manda cada lectura a
 * revisión humana. Se comprobó midiéndola, no suponiéndola.
 *
 * Solo se enuncia el precio del lado que se publica, como en el libro P2P, más
 * el instante que la plaza declara. Y las dos redacciones de una misma plaza
 * **tienen que diferir**: la huella de contenido de un hecho se calcula sobre
 * tipo, afirmación y fecha, así que dos lados con el mismo texto serían el
 * mismo hecho y uno desplazaría al otro.
 */
export function criptoyaAssertion(quote: CriptoyaQuote, asset: string, side: RateSide): string {
  const field = side === 'SELL' ? 'ask' : 'bid';
  return `${asset}/BOB ${quote.venue} ${field} ${criptoyaSidePrice(quote, side)} time ${quote.time}.`;
}
