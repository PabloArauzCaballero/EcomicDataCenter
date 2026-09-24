/**
 * Los precios que Bolivia no fija y que le mueven la economía.
 *
 * Seis familias, en el orden en que se piden: energía, minerales, agro,
 * ganadería, insumos industriales y construcción. Cada producto puede tener
 * varias lecturas y no es redundancia: el crudo Brent y lo que Bolivia pagó por
 * kilo de diésel importado son dos preguntas distintas sobre el mismo producto,
 * y la segunda es la que llega a la balanza de pagos.
 *
 * Cinco ámbitos, y el ámbito viaja con la serie para que nadie compare un
 * índice con un precio sin saberlo:
 *
 * - `WORLD`: la cotización de referencia del mercado mundial (Banco Mundial,
 *   la «hoja rosa», o la EIA a través de FRED).
 * - `REGIONAL`: la de los vecinos que venden y compran lo mismo que Bolivia —el
 *   trigo y el maíz argentinos, la carne brasileña— (FAO/GIEWS).
 * - `US_PRODUCER_INDEX`: el índice de precios al productor de EE. UU. Es un
 *   índice, no un precio, y el único registro abierto y mensual de resinas,
 *   cemento o viguetas pretensadas. La base la pone el publicador.
 * - `BOLIVIA_MARKET`: el precio en bolivianos en un mercado del país (INE y
 *   Ministerio de Desarrollo Productivo, republicados por FAO/GIEWS).
 * - `BOLIVIA_CUSTOMS`: el valor unitario de lo que Bolivia declaró en aduana,
 *   anual (Naciones Unidas, Comtrade). Está en `exogenous-customs-sources.ts`.
 */

export type ExogenousGroup =
  'ENERGY' | 'MINERALS' | 'AGRICULTURE' | 'LIVESTOCK' | 'INDUSTRY' | 'CONSTRUCTION';

export type ExogenousScope =
  'WORLD' | 'REGIONAL' | 'US_PRODUCER_INDEX' | 'BOLIVIA_MARKET' | 'BOLIVIA_CUSTOMS';

export type ExogenousOrigin =
  | { readonly kind: 'WORLD_BANK'; readonly column: string }
  | { readonly kind: 'FRED'; readonly id: string }
  | { readonly kind: 'FAO'; readonly uuid: string };

export interface ExogenousSpec {
  readonly code: string;
  readonly group: ExogenousGroup;
  /** La clave del producto, compartida por todas sus lecturas. */
  readonly product: string;
  readonly productLabel: string;
  /** El nombre completo de la lectura, el que se lee en una leyenda. */
  readonly name: string;
  readonly scope: ExogenousScope;
  /** Dónde se forma el precio: una bolsa, un puerto, una ciudad. */
  readonly market: string;
  readonly unit: string;
  readonly kind: 'PRICE' | 'INDEX';
  readonly note: string;
  readonly origin: ExogenousOrigin;
}

/** El primer mes que se recoge: un cuarto de siglo alcanza para ver dos ciclos. */
export const FIRST_MONTH = '2000-01';

export const WORLD_BANK_PAGE = 'https://www.worldbank.org/en/research/commodity-markets';
export const FRED_CSV = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
export const FAO_PRICES = 'https://fpma.fao.org/giews/v4/price_module/api/v1/FpmaSeriePrice';
export const USER_AGENT = 'observatorio-economico-bolivia/1.0 (+datos abiertos)';

export type Spec = Omit<ExogenousSpec, 'code' | 'origin' | 'kind'> & { readonly kind?: 'INDEX' };

export const bank = (code: string, column: string, spec: Spec): ExogenousSpec => ({
  code: `EXO_${code}`,
  kind: 'PRICE',
  origin: { kind: 'WORLD_BANK', column },
  ...spec,
});

export const fred = (code: string, id: string, spec: Spec): ExogenousSpec => ({
  code: `EXO_${code}`,
  kind: spec.kind ?? 'PRICE',
  origin: { kind: 'FRED', id },
  ...spec,
});

const PPI_NOTE =
  'Índice de precios al productor de EE. UU. (Oficina de Estadísticas Laborales). Mide cómo se mueve el precio, no cuánto cuesta.';

export const ppi = (
  code: string,
  id: string,
  group: ExogenousGroup,
  product: string,
  productLabel: string,
  name: string,
): ExogenousSpec =>
  fred(code, id, {
    group,
    product,
    productLabel,
    name,
    scope: 'US_PRODUCER_INDEX',
    market: 'Estados Unidos',
    unit: 'índice',
    kind: 'INDEX',
    note: PPI_NOTE,
  });

export const world = (
  group: ExogenousGroup,
  product: string,
  productLabel: string,
  market: string,
  unit: string,
  note: string,
) => ({ group, product, productLabel, scope: 'WORLD' as const, market, unit, note });
