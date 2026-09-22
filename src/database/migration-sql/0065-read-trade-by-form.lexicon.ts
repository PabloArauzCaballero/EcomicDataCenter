/**
 * The vocabulary that files a commerce reading by the way the trade is done,
 * exactly as migration 0065 wrote it.
 *
 * Kept beside the view for the same reason the press topics are: this is the
 * half that gets argued over — whether a sale closed on WhatsApp and paid in
 * cash at the door is informal commerce or electronic commerce — while the
 * machinery around it barely changes. A snapshot, never edited: a later change
 * to how a form of trade is filed is a later migration with its own copy.
 *
 * Every expression reads `named`, which is the reading's label with its accents
 * removed. The label and not the statement, deliberately: the statement of a
 * channel reading routinely names every other channel it was measured against,
 * so matching on it would file a reading about popular fairs under the
 * supermarket it was compared with. The label is written once, for this figure.
 */

/**
 * How the trade is conducted.
 *
 * The order is not alphabetical and cannot be sorted: a fair is a market and a
 * boutique sits in a mall, so the narrower form has to be tested first or it
 * disappears into the wider one. `CUENTA_PROPIA` is last of the trading forms
 * because a reading about gremiales in a fair is a reading about the fair.
 */
export const businessFormCase = `  CASE
    WHEN named ~ ANY (ARRAY[
      '\\mferia', '\\m16 de julio\\M', '\\mferiant'
    ]) THEN 'FERIA_POPULAR'
    WHEN named ~ ANY (ARRAY[
      '\\mmercado(s)? tradicional', '\\mmercado(s)? de abasto', '\\mpuesto de mercado',
      '\\mcanal tradicional', '\\mvivander'
    ]) THEN 'MERCADO_TRADICIONAL'
    WHEN named ~ ANY (ARRAY[
      '\\mtienda(s)? de barrio', '\\mbodega', '\\malmacen', '\\mformato(s)? pequen',
      '\\mpulperia'
    ]) THEN 'TIENDA_BARRIO'
    WHEN named ~ ANY (ARRAY[
      '\\msupermercado', '\\mcanal moderno', '\\mminimarket', '\\mhard discount',
      '\\mmayorista'
    ]) THEN 'SUPERMERCADO'
    WHEN named ~ ANY (ARRAY[
      '\\mboutique'
    ]) THEN 'BOUTIQUE'
    WHEN named ~ ANY (ARRAY[
      '\\mcentro(s)? comercial', '\\mgaleria', '\\mmall\\M'
    ]) THEN 'CENTRO_COMERCIAL'
    WHEN named ~ ANY (ARRAY[
      '\\mcatalogo', '\\mventa directa', '\\mrevendedor'
    ]) THEN 'VENTA_CATALOGO'
    WHEN named ~ ANY (ARRAY[
      '\\mwhatsapp', '\\mmarketplace', '\\minstagram', '\\mfacebook', '\\mtiktok',
      '\\mredes sociales', '\\mred social', '\\mmessenger'
    ]) THEN 'COMERCIO_SOCIAL'
    WHEN named ~ ANY (ARRAY[
      '\\mcomercio electronico', '\\mpor internet', '\\men linea', '\\mtienda(s)? virtual',
      '\\mpasarela', '\\mecommerce', '\\mdelivery'
    ]) THEN 'COMERCIO_ELECTRONICO'
    WHEN named ~ ANY (ARRAY[
      '\\mcontrabando', '\\mmercaderia ilegal', '\\mfrontera', '\\milicito'
    ]) THEN 'CONTRABANDO'
    WHEN named ~ ANY (ARRAY[
      '\\mcuenta propia', '\\mcuentapropi', '\\mgremial', '\\mambulante',
      '\\mminorista', '\\minformal'
    ]) THEN 'CUENTA_PROPIA'
    ELSE 'NINGUNA'
  END`;

/**
 * Whether that form of trade is registered, taxed and invoiced, or is not.
 *
 * Derived from the form and never annotated, so a reading added tomorrow
 * inherits the classification without anybody remembering to apply it.
 *
 * `COMERCIO_SOCIAL` is `MIXTO` and that is the arguable one. A sale offered on
 * Marketplace, agreed on WhatsApp and paid in cash at the door is informal in
 * everything but its shop window: 32% of Bolivians who buy online do not
 * complete the payment online, and TikTok Shop does not operate in the country.
 * Calling it formal because it happened on a platform would be the error this
 * register exists to prevent; calling it informal outright would erase the part
 * of it that is invoiced. It is filed between the two, visibly.
 */
export const marketRegimeCase = `  CASE
    WHEN business_form IN (
      'FERIA_POPULAR', 'MERCADO_TRADICIONAL', 'TIENDA_BARRIO', 'CONTRABANDO', 'CUENTA_PROPIA'
    ) THEN 'INFORMAL'
    WHEN business_form IN (
      'COMERCIO_SOCIAL', 'COMERCIO_ELECTRONICO', 'VENTA_CATALOGO'
    ) THEN 'MIXTO'
    WHEN business_form IN (
      'SUPERMERCADO', 'CENTRO_COMERCIAL', 'BOUTIQUE'
    ) THEN 'FORMAL'
    ELSE 'NINGUNO'
  END`;

/**
 * Which side of the counter the figure describes.
 *
 * A channel penetration and a fair's weekly turnover are both "commerce" and
 * are not the same measurement: one counts households that buy, the other
 * counts what the sellers move. Averaging them would produce a number that
 * describes nobody. `FRICCION` is named separately because a reading about a
 * payment that does not close is neither demand nor supply — it is the cost of
 * trading, and it is the reading a microeconomic panel most needs to keep.
 */
export const tradeSideCase = `  CASE
    WHEN named ~ ANY (ARRAY[
      '\\mdesconfianza', '\\mno concretan', '\\mevasion', '\\mriesgo', '\\mperdida',
      '\\mabandona', '\\mfraude', '\\mestafa'
    ]) THEN 'FRICCION'
    WHEN named ~ ANY (ARRAY[
      '\\mpagos con', '\\mpagos inmediatos', '\\mpagos electronicos', '\\mbilletera',
      '\\mpuntos de atencion', '\\mcorresponsal', '\\mefectivo\\M', '\\mtarjeta',
      '\\mtransferencia', '\\mpasarela', '\\mdisponibilidad', '\\moperando',
      '\\moperaciones electronicas'
    ]) THEN 'INFRAESTRUCTURA'
    WHEN named ~ ANY (ARRAY[
      '\\mcomerciante', '\\mvendedor', '\\mgremial', '\\mcuenta propia', '\\mcuentapropi',
      '\\mindustria', '\\masociacion', '\\mmueve', '\\mfactura', '\\mempleo',
      '\\mocupados', '\\mtrabajador', '\\msuperficie', '\\mafiliad', '\\mmercaderia'
    ]) THEN 'OFERTA'
    WHEN named ~ ANY (ARRAY[
      '\\mhogares', '\\mcompran', '\\mcompradores', '\\mconsumidor', '\\mvisitantes',
      '\\musuarios', '\\mshopper', '\\mgasto', '\\mcanasta', '\\mconsumo', '\\mcompra'
    ]) THEN 'DEMANDA'
    ELSE 'NINGUNO'
  END`;

/**
 * How the money changes hands.
 *
 * This is the dimension that distinguishes Bolivian informal trade from its
 * regional neighbours, and the reason the register keeps it apart from the
 * channel: the same purchase can be discovered on Instagram and settled in
 * cash, and only the second half tells you whether it left a record anywhere.
 */
export const settlementCase = `  CASE
    WHEN named ~ ANY (ARRAY['\\mqr\\M', '\\mcodigo qr']) THEN 'QR'
    WHEN named ~ ANY (ARRAY['\\mbilletera']) THEN 'BILLETERA_MOVIL'
    WHEN named ~ ANY (ARRAY['\\mtarjeta', '\\mpos\\M']) THEN 'TARJETA'
    WHEN named ~ ANY (ARRAY['\\mtransferencia', '\\mdeposito bancario']) THEN 'TRANSFERENCIA'
    WHEN named ~ ANY (ARRAY[
      '\\mpasarela', '\\mpago en linea', '\\mpago online'
    ]) THEN 'PASARELA'
    WHEN named ~ ANY (ARRAY[
      '\\mcontra entrega', '\\mcontraentrega', '\\mpago fisico', '\\mal recibir'
    ]) THEN 'CONTRA_ENTREGA'
    WHEN named ~ ANY (ARRAY['\\mefectivo']) THEN 'EFECTIVO'
    ELSE 'NINGUNO'
  END`;

/** What is being traded, so two channels are compared over the same basket. */
export const goodsClassCase = `  CASE
    WHEN named ~ ANY (ARRAY[
      '\\mropa', '\\mvestimenta', '\\mmoda\\M', '\\mcalzado', '\\mtextil'
    ]) THEN 'ROPA'
    WHEN named ~ ANY (ARRAY[
      '\\malimento', '\\mbebida', '\\mconsumo masivo', '\\mcanasta', '\\mabarrote',
      '\\mvivere'
    ]) THEN 'ALIMENTOS'
    WHEN named ~ ANY (ARRAY[
      '\\mtecnologia', '\\mdispositivo', '\\melectrodomestico', '\\mcelular'
    ]) THEN 'TECNOLOGIA'
    WHEN named ~ ANY (ARRAY[
      '\\mservicio', '\\msuscripcion', '\\mrecarga'
    ]) THEN 'SERVICIOS'
    ELSE 'TRANSVERSAL'
  END`;

/**
 * What kind of quantity the figure is, so two of them are never added up.
 *
 * This is the guard the channel model depends on. "71% of households buy
 * clothing in fairs" and "small formats are 26.5% of shopper spending" are both
 * percentages about channels, and adding them produces a number that means
 * nothing: one counts households, the other counts money. The unit alone cannot
 * separate them — both are `PERCENT` — so the kind is read from what the label
 * counts, and only `PENETRACION` is ever summed.
 */
export const measureKindCase = `  CASE
    WHEN unit IN ('BOB', 'USD') THEN 'VALOR'
    WHEN unit = 'PER_MINUTE' THEN 'FRECUENCIA'
    WHEN unit IN ('PERSONS', 'ACCOUNTS') THEN 'PERSONAS'
    WHEN unit = 'COUNT' THEN 'CONTEO'
    WHEN named ~ ANY (ARRAY[
      '\\mcrecimiento', '\\mvariacion', '\\minteranual'
    ]) THEN 'VARIACION'
    WHEN named ~ ANY (ARRAY[
      '\\mhogares', '\\mcompradores', '\\musuarios', '\\mocupados', '\\mtrabajador',
      '\\mvisitantes', '\\mpersonas', '\\mcuentas'
    ]) THEN 'PENETRACION'
    WHEN named ~ ANY (ARRAY[
      '\\mparticipacion', '\\mgasto', '\\mvolumen', '\\mpeso\\M', '\\mcontenido'
    ]) THEN 'ESTRUCTURA'
    ELSE 'OTRA'
  END`;

/**
 * Whether the figure describes everybody or one slice of them.
 *
 * A panel that reports 24% of households buying clothing in malls and 43% of
 * the top strata doing the same is reporting one population and a subset of it.
 * Summed into one channel mix they would count the same households twice and
 * inflate the formal side, which is precisely the direction an unwary reader
 * already leans. Only `TOTAL` enters the mix; the segment readings stay
 * queryable on their own.
 */
export const populationScopeCase = `  CASE
    WHEN named ~ ANY (ARRAY[
      '\\mestrato', '\\msegmento', '\\mnivel socioeconomico', '\\mde 21 a',
      '\\mjovenes', '\\mmujeres', '\\mhombres', '\\madultos'
    ]) THEN 'SEGMENTO'
    ELSE 'TOTAL'
  END`;

/**
 * Where the figure was measured.
 *
 * Read from the label alone and from nothing else. A national panel and a
 * survey of six cities are different countries for this purpose: informal trade
 * in El Alto is not informal trade in Santa Cruz, and a reading that averages
 * them silently is worse than no reading. `NACIONAL` is the default only
 * because a compiler that states no scope is stating a country figure.
 */
export const territoryCase = `  CASE
    WHEN named ~ ANY (ARRAY['\\mel alto\\M']) THEN 'EL_ALTO'
    WHEN named ~ ANY (ARRAY['\\mla paz\\M']) THEN 'LA_PAZ'
    WHEN named ~ ANY (ARRAY['\\msanta cruz\\M']) THEN 'SANTA_CRUZ'
    WHEN named ~ ANY (ARRAY['\\mcochabamba\\M']) THEN 'COCHABAMBA'
    WHEN named ~ ANY (ARRAY['\\moruro\\M']) THEN 'ORURO'
    WHEN named ~ ANY (ARRAY['\\mpotosi\\M']) THEN 'POTOSI'
    WHEN named ~ ANY (ARRAY['\\mtarija\\M']) THEN 'TARIJA'
    WHEN named ~ ANY (ARRAY['\\mchuquisaca\\M', '\\msucre\\M']) THEN 'CHUQUISACA'
    WHEN named ~ ANY (ARRAY[
      '\\mrural', '\\mperiurban', '\\mcampesin'
    ]) THEN 'RURAL'
    WHEN named ~ ANY (ARRAY[
      '\\murbano', '\\murbana', '\\mciudades', '\\meje troncal', '\\meje central'
    ]) THEN 'URBANO'
    ELSE 'NACIONAL'
  END`;
