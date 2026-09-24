import { bank, ppi, world } from './exogenous-spec';
import type { ExogenousSpec } from './exogenous-spec';

/** Insumos industriales y construcción: fertilizantes, resinas, químicos, cemento y acero. */
export const INDUSTRY_AND_CONSTRUCTION: readonly ExogenousSpec[] = [
  // Insumos industriales
  ...(
    [
      ['UREA', 'Urea ', 'Urea', 'Bolivia la produce en Bulo Bulo desde 2017 y la exporta.'],
      ['DAP', 'DAP', 'Fosfato diamónico (DAP)', 'Fertilizante fosfatado.'],
      ['TSP', 'TSP', 'Superfosfato triple (TSP)', 'Fertilizante fosfatado.'],
      [
        'POTASH',
        'Potassium chloride **',
        'Cloruro de potasio',
        'El potasio del salar de Uyuni compite con este precio.',
      ],
    ] as const
  ).map(([code, column, name, note]) =>
    bank(code, column, {
      ...world('INDUSTRY', 'FERTILIZERS', 'Fertilizantes', 'Mercado mundial', 'US$/tonelada', note),
      name,
    }),
  ),
  ppi(
    'RESINS',
    'WPU066',
    'INDUSTRY',
    'RESINS',
    'Resinas plásticas (PET, PP, PE)',
    'Resinas y materiales plásticos (índice EE. UU.)',
  ),
  ppi(
    'THERMOPLASTICS',
    'WPU0662',
    'INDUSTRY',
    'RESINS',
    'Resinas plásticas (PET, PP, PE)',
    'Resinas termoplásticas: PET, PP, PE (índice EE. UU.)',
  ),
  ppi(
    'PESTICIDES',
    'WPU06530109',
    'INDUSTRY',
    'AGROCHEMICALS',
    'Herbicidas y plaguicidas',
    'Plaguicidas y herbicidas agrícolas (índice EE. UU.)',
  ),
  ppi(
    'NITROGENATES',
    'WPU065201',
    'INDUSTRY',
    'FERTILIZERS',
    'Fertilizantes',
    'Fertilizantes nitrogenados (índice EE. UU.)',
  ),
  ppi(
    'SULFURIC_ACID',
    'WPU0613020T1',
    'INDUSTRY',
    'PRECURSORS',
    'Precursores químicos',
    'Ácido sulfúrico (índice EE. UU.)',
  ),
  ppi(
    'ORGANIC_CHEMICALS',
    'WPU0614',
    'INDUSTRY',
    'PRECURSORS',
    'Precursores químicos',
    'Químicos orgánicos básicos (índice EE. UU.)',
  ),
  // Construcción
  ppi(
    'CEMENT',
    'WPU1322',
    'CONSTRUCTION',
    'CEMENT',
    'Cemento',
    'Cemento hidráulico (índice EE. UU.)',
  ),
  ppi(
    'PRESTRESSED',
    'WPU133501',
    'CONSTRUCTION',
    'JOISTS',
    'Viguetas pretensadas',
    'Productos de hormigón pretensado (índice EE. UU.)',
  ),
  ppi(
    'STEEL_WIRE',
    'WPU101705',
    'CONSTRUCTION',
    'JOISTS',
    'Viguetas pretensadas',
    'Alambre de acero (índice EE. UU.)',
  ),
  ppi(
    'REBAR',
    'WPU101704',
    'CONSTRUCTION',
    'REBAR',
    'Fierro de construcción',
    'Barras y perfiles de acero laminado (índice EE. UU.)',
  ),
  ppi(
    'READY_MIX',
    'WPU1333',
    'CONSTRUCTION',
    'CONCRETE',
    'Hormigón y áridos',
    'Hormigón premezclado (índice EE. UU.)',
  ),
  ppi(
    'AGGREGATES',
    'WPU1321',
    'CONSTRUCTION',
    'CONCRETE',
    'Hormigón y áridos',
    'Arena, grava y piedra (índice EE. UU.)',
  ),
  ppi(
    'BRICK',
    'WPU1342',
    'CONSTRUCTION',
    'BRICK',
    'Ladrillo',
    'Ladrillo y teja de arcilla (índice EE. UU.)',
  ),
  ppi('LUMBER', 'WPU081', 'CONSTRUCTION', 'LUMBER', 'Madera', 'Madera aserrada (índice EE. UU.)'),
];
