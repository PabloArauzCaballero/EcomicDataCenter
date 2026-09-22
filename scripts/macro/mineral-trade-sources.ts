/**
 * Lo que Bolivia saca del suelo y vende, partida por partida.
 *
 * El observatorio tenía el comercio exterior en una sola cifra —el total de
 * mercancías declarado ante Naciones Unidas— y las rentas por recurso del Banco
 * Mundial, que son un porcentaje del PIB. Ninguna de las dos responde a «cuánto
 * zinc», «cuánto oro» ni, sobre todo, «cuánto litio»: la primera no distingue
 * productos y la segunda no distingue minerales entre sí ni llega a 2024.
 *
 * El registro de Naciones Unidas sí, porque la declaración aduanera viene
 * clasificada por partida del Sistema Armonizado. Este archivo es esa lista de
 * partidas, y es una decisión editorial que conviene dejar escrita.
 *
 * **Dos medidas por partida, y no una.** El valor en dólares mezcla precio y
 * volumen: una exportación de oro que vale el doble puede ser el mismo oro con
 * el precio duplicado. El peso neto que el mismo registro declara separa las
 * dos cosas, y es la única de las dos que responde a «cuánto se está sacando».
 * Por eso cada partida produce dos series.
 *
 * **Dos niveles, que no se suman.** El capítulo 26 entero —minerales
 * metalíferos— va como total, y debajo van sus partidas una por una. Sumar el
 * capítulo con sus partidas contaría lo mismo dos veces; están los dos porque
 * el total es la magnitud y el desglose es el relevo entre minerales, y quien
 * dibuje ambos tiene que elegir uno.
 *
 * **El mineral y el metal son dos partidas distintas.** El zinc sale sobre todo
 * como concentrado (2608) y el estaño sobre todo como metal refinado (8001):
 * es la diferencia entre vender la piedra y vender el lingote, que es
 * exactamente la pregunta de cuánto se transforma dentro del país.
 *
 * **El litio no tiene partida propia de mineral.** La salmuera no se exporta;
 * lo que cruza la frontera es carbonato de litio, que el Sistema Armonizado
 * clasifica entre los productos químicos (2836.91) y no entre los minerales.
 * Buscarlo en el capítulo 26 es no encontrarlo nunca, que es la razón por la
 * que un informe de minería boliviana puede no tener una sola cifra de litio.
 *
 * **Las partidas casi vacías se piden igual.** El cinc en bruto (7901) tiene
 * cuatro declaraciones en treinta y cuatro años, y la última son quince
 * dólares: Bolivia vende el concentrado y no el metal. Se pide en cada corrida
 * de todos modos, por la misma razón que las fichas estables sin mercado llevan
 * código — el día que una fundición abra, la serie empieza sola en vez de
 * esperar a que alguien lo note.
 *
 * **El capítulo 26 no declara peso.** Su serie en kilos sale vacía en las
 * treinta y cuatro corridas y el colector lo dice en su salida en vez de
 * escribirla: un agregado de capítulo se publica en valor y nada más. El peso
 * de los minerales metalíferos se arma sumando sus partidas, que sí lo traen.
 */

export interface Commodity {
  /** La partida del Sistema Armonizado, tal como la pide el registro. */
  hs: string;
  /** El tramo del código que identifica la serie aguas abajo. */
  slug: string;
  /** Cómo se llama en el tablero. */
  name: string;
  /**
   * `TOTAL` para el capítulo entero, `LINE` para una partida suya.
   *
   * Lo lleva el catálogo y no el dibujo porque es una propiedad del dato: quien
   * lea estas series desde otro sitio necesita saber cuáles se solapan.
   */
  level: 'TOTAL' | 'LINE';
  /** Familia, para agrupar el desglose sin volver a mirar el código. */
  family: 'MINERAL' | 'METAL' | 'QUIMICO' | 'HIDROCARBURO';
}

export const COMMODITIES: readonly Commodity[] = [
  {
    hs: '26',
    slug: 'METAL_ORES',
    name: 'Minerales metalíferos (capítulo entero)',
    level: 'TOTAL',
    family: 'MINERAL',
  },
  { hs: '2607', slug: 'LEAD_ORE', name: 'Minerales de plomo', level: 'LINE', family: 'MINERAL' },
  { hs: '2608', slug: 'ZINC_ORE', name: 'Minerales de cinc', level: 'LINE', family: 'MINERAL' },
  { hs: '2609', slug: 'TIN_ORE', name: 'Minerales de estaño', level: 'LINE', family: 'MINERAL' },
  {
    hs: '2616',
    slug: 'PRECIOUS_ORE',
    name: 'Minerales de oro y plata',
    level: 'LINE',
    family: 'MINERAL',
  },
  {
    hs: '2617',
    slug: 'OTHER_ORE',
    name: 'Los demás minerales (antimonio, wólfram)',
    level: 'LINE',
    family: 'MINERAL',
  },
  { hs: '7106', slug: 'SILVER', name: 'Plata en bruto', level: 'LINE', family: 'METAL' },
  { hs: '7108', slug: 'GOLD', name: 'Oro en bruto', level: 'LINE', family: 'METAL' },
  { hs: '7801', slug: 'LEAD_METAL', name: 'Plomo en bruto', level: 'LINE', family: 'METAL' },
  { hs: '7901', slug: 'ZINC_METAL', name: 'Cinc en bruto', level: 'LINE', family: 'METAL' },
  { hs: '8001', slug: 'TIN_METAL', name: 'Estaño en bruto', level: 'LINE', family: 'METAL' },
  {
    hs: '283691',
    slug: 'LITHIUM_CARBONATE',
    name: 'Carbonato de litio',
    level: 'LINE',
    family: 'QUIMICO',
  },
  {
    hs: '2709',
    slug: 'CRUDE_OIL',
    name: 'Petróleo crudo',
    level: 'LINE',
    family: 'HIDROCARBURO',
  },
  {
    hs: '2710',
    slug: 'OIL_PRODUCTS',
    name: 'Derivados del petróleo',
    level: 'LINE',
    family: 'HIDROCARBURO',
  },
  {
    hs: '2711',
    slug: 'NATURAL_GAS',
    name: 'Gas natural y gases de petróleo',
    level: 'LINE',
    family: 'HIDROCARBURO',
  },
];

/**
 * El identificador de cada serie aguas abajo.
 *
 * Un prefijo común y no un nombre por producto: la vista anual archiva por
 * `indicator_code`, y un prefijo deja filiar las treinta series de una vez en
 * lugar de escribir treinta ramas que hay que recordar ampliar cada vez que se
 * añade una partida.
 */
export const indicatorCode = (commodity: Commodity, measure: 'USD' | 'KG'): string =>
  `COMMODITY_EXPORTS_${commodity.slug}_${measure}`;

/** El prefijo con el que la migración las reconoce todas. */
export const INDICATOR_PREFIX = 'COMMODITY_EXPORTS_';

/** Dónde publica Naciones Unidas la declaración aduanera. */
export const COMTRADE_PREVIEW = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';

/** El código de Bolivia en la lista de países del registro. */
export const REPORTER = 68;

export const PUBLISHER = 'NACIONES UNIDAS';

/** El primer año con una declaración boliviana en el registro. */
export const FIRST_YEAR = 1992;

export const USER_AGENT = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';
