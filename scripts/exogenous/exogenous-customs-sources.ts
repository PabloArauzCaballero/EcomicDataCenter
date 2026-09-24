import type { ExogenousGroup } from './exogenous-sources';

/**
 * Lo que Bolivia pagó y cobró por kilo en su aduana, partida por partida.
 *
 * Para la mitad de lo que importa no hay cotización abierta: nadie publica
 * gratis el precio mensual del PET, del polipropileno por grado, del herbicida
 * o de la barra corrugada. Pero la declaración aduanera trae el valor **y** el
 * peso de cada partida, y su cociente es el precio que el país pagó de verdad,
 * con flete y con la mezcla de calidades que compró. Es anual y es un valor
 * unitario, no una cotización; el tablero lo dice en cada lectura.
 *
 * Una partida puede cambiar de código entre versiones del Sistema Armonizado
 * —el PET era 3907.60 hasta 2016 y es 3907.61 desde 2017—, así que cada
 * producto lleva sus códigos en orden de preferencia y se lee el primero que el
 * registro declare ese año.
 */

export const COMTRADE_PREVIEW = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
export const REPORTER = 68;
export const FIRST_YEAR = 2010;
export const PUBLISHER = 'NACIONES UNIDAS (COMTRADE)';

export interface CustomsSpec {
  readonly code: string;
  readonly flow: 'X' | 'M';
  readonly hs: readonly string[];
  readonly group: ExogenousGroup;
  readonly product: string;
  readonly productLabel: string;
  readonly name: string;
  readonly note: string;
}

type Row = readonly [string, readonly string[], ExogenousGroup, string, string, string, string?];

const EXPORT_NOTE =
  'Valor unitario de lo que Bolivia exportó: valor FOB declarado entre peso neto.';
const IMPORT_NOTE = 'Valor unitario de lo que Bolivia importó: valor declarado entre peso neto.';

const spec =
  (flow: 'X' | 'M') =>
  ([code, hs, group, product, productLabel, name, note]: Row): CustomsSpec => ({
    code: `EXO_BO_${flow === 'X' ? 'EXPORT' : 'IMPORT'}_${code}`,
    flow,
    hs,
    group,
    product,
    productLabel,
    name,
    note: note ?? (flow === 'X' ? EXPORT_NOTE : IMPORT_NOTE),
  });

const EXPORTS: readonly Row[] = [
  [
    'NATURAL_GAS',
    ['271121'],
    'ENERGY',
    'NATURAL_GAS',
    'Gas natural',
    'Gas natural exportado (Brasil y Argentina)',
  ],
  [
    'LITHIUM',
    ['283691'],
    'MINERALS',
    'LITHIUM',
    'Litio',
    'Carbonato de litio exportado',
    'No hay cotización abierta del litio; este es el precio al que YLB vendió el carbonato (partida química 2836.91).',
  ],
  [
    'BISMUTH',
    ['8106'],
    'MINERALS',
    'BISMUTH',
    'Bismuto',
    'Bismuto exportado',
    'No hay cotización abierta del bismuto; este es el precio al que salió de Bolivia.',
  ],
  ['TIN', ['8001'], 'MINERALS', 'TIN', 'Estaño', 'Estaño metálico exportado (Vinto)'],
  ['SILVER', ['7106'], 'MINERALS', 'SILVER', 'Plata', 'Plata en bruto exportada'],
  ['GOLD', ['7108'], 'MINERALS', 'GOLD', 'Oro', 'Oro exportado'],
  ['QUINOA', ['100850'], 'AGRICULTURE', 'QUINOA', 'Quinua', 'Quinua exportada'],
  [
    'BRAZIL_NUT',
    ['080122'],
    'AGRICULTURE',
    'BRAZIL_NUT',
    'Castaña',
    'Castaña sin cáscara exportada',
    'No hay cotización mundial abierta de la castaña amazónica; Bolivia es su primer exportador.',
  ],
  ['SOYBEAN_MEAL', ['230400'], 'AGRICULTURE', 'SOY', 'Soya', 'Torta de soya exportada'],
  ['SOYBEAN_OIL', ['150710'], 'AGRICULTURE', 'SOY', 'Soya', 'Aceite de soya crudo exportado'],
  [
    'SUNFLOWER_OIL',
    ['151211'],
    'AGRICULTURE',
    'SUNFLOWER',
    'Girasol',
    'Aceite de girasol crudo exportado',
  ],
  ['SUGAR', ['170199', '170191'], 'AGRICULTURE', 'SUGAR', 'Azúcar', 'Azúcar refinada exportada'],
  ['BANANA', ['080390', '080300'], 'AGRICULTURE', 'BANANA', 'Banano y plátano', 'Banano exportado'],
  ['COFFEE', ['090111'], 'AGRICULTURE', 'COFFEE', 'Café', 'Café sin tostar exportado'],
  ['COCOA', ['1801'], 'AGRICULTURE', 'COCOA', 'Cacao', 'Cacao en grano exportado'],
  [
    'BEEF',
    ['020230', '020130'],
    'LIVESTOCK',
    'BEEF',
    'Carne de res',
    'Carne bovina deshuesada exportada',
  ],
  ['UREA', ['310210'], 'INDUSTRY', 'FERTILIZERS', 'Fertilizantes', 'Urea exportada (Bulo Bulo)'],
];

const IMPORTS: readonly Row[] = [
  [
    'GASOLINE',
    ['271012', '271011'],
    'ENERGY',
    'GASOLINE',
    'Gasolina',
    'Gasolinas y naftas importadas',
  ],
  ['DIESEL', ['271019'], 'ENERGY', 'DIESEL', 'Diésel', 'Diésel y aceites medios importados'],
  ['LPG', ['271112', '271113'], 'ENERGY', 'LPG', 'GLP (propano)', 'Propano licuado importado'],
  ['WHEAT', ['100199', '100190'], 'AGRICULTURE', 'WHEAT', 'Trigo', 'Trigo importado'],
  ['WHEAT_FLOUR', ['110100'], 'AGRICULTURE', 'WHEAT', 'Trigo', 'Harina de trigo importada'],
  ['FISH', ['0303'], 'LIVESTOCK', 'FISH', 'Piscicultura', 'Pescado congelado importado'],
  [
    'PET',
    ['390761', '390760'],
    'INDUSTRY',
    'RESINS',
    'Resinas plásticas (PET, PP, PE)',
    'Resina PET importada',
  ],
  [
    'POLYPROPYLENE',
    ['390210'],
    'INDUSTRY',
    'RESINS',
    'Resinas plásticas (PET, PP, PE)',
    'Polipropileno (PP) importado',
  ],
  [
    'HDPE',
    ['390120'],
    'INDUSTRY',
    'RESINS',
    'Resinas plásticas (PET, PP, PE)',
    'Polietileno de alta densidad importado',
  ],
  [
    'LDPE',
    ['390110'],
    'INDUSTRY',
    'RESINS',
    'Resinas plásticas (PET, PP, PE)',
    'Polietileno de baja densidad importado',
  ],
  ['UREA', ['310210'], 'INDUSTRY', 'FERTILIZERS', 'Fertilizantes', 'Urea importada'],
  [
    'HERBICIDES',
    ['380893'],
    'INDUSTRY',
    'AGROCHEMICALS',
    'Herbicidas y plaguicidas',
    'Herbicidas importados',
  ],
  [
    'SULFURIC_ACID',
    ['280700'],
    'INDUSTRY',
    'PRECURSORS',
    'Precursores químicos',
    'Ácido sulfúrico importado',
  ],
  [
    'HYDROCHLORIC_ACID',
    ['280610'],
    'INDUSTRY',
    'PRECURSORS',
    'Precursores químicos',
    'Ácido clorhídrico importado',
  ],
  ['ACETONE', ['291411'], 'INDUSTRY', 'PRECURSORS', 'Precursores químicos', 'Acetona importada'],
  ['CEMENT', ['252329'], 'CONSTRUCTION', 'CEMENT', 'Cemento', 'Cemento portland importado'],
  [
    'REBAR',
    ['721420'],
    'CONSTRUCTION',
    'REBAR',
    'Fierro de construcción',
    'Barras corrugadas importadas',
  ],
  [
    'STEEL_WIRE',
    ['721710'],
    'CONSTRUCTION',
    'JOISTS',
    'Viguetas pretensadas',
    'Alambre de acero importado',
  ],
];

export const CUSTOMS_SERIES: readonly CustomsSpec[] = [
  ...EXPORTS.map(spec('X')),
  ...IMPORTS.map(spec('M')),
];
