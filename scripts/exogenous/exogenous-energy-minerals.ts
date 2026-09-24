import { bank, fred, ppi, world } from './exogenous-spec';
import type { ExogenousSpec } from './exogenous-spec';

/** Energía y minerales: lo que Bolivia vende del subsuelo y lo que importa para moverse. */
export const ENERGY_AND_MINERALS: readonly ExogenousSpec[] = [
  // Energía
  bank('CRUDE_BRENT', 'Crude oil, Brent', {
    ...world(
      'ENERGY',
      'CRUDE',
      'Petróleo crudo',
      'Brent, mar del Norte',
      'US$/barril',
      'La referencia con la que se indexan los contratos de gas de Bolivia con Brasil y Argentina.',
    ),
    name: 'Petróleo Brent',
  }),
  bank('CRUDE_WTI', 'Crude oil, WTI', {
    ...world('ENERGY', 'CRUDE', 'Petróleo crudo', 'WTI, Cushing', 'US$/barril', 'Crudo de EE. UU.'),
    name: 'Petróleo WTI',
  }),
  fred('GASOLINE_GULF', 'DGASUSGULF', {
    ...world(
      'ENERGY',
      'GASOLINE',
      'Gasolina',
      'Costa del Golfo, EE. UU.',
      'US$/galón',
      'Gasolina convencional al contado, promedio del mes. Bolivia importa buena parte de la que vende a un precio que fija el Estado.',
    ),
    name: 'Gasolina, costa del Golfo',
  }),
  fred('DIESEL_GULF', 'DDFUELUSGULF', {
    ...world(
      'ENERGY',
      'DIESEL',
      'Diésel',
      'Costa del Golfo, EE. UU.',
      'US$/galón',
      'Diésel de ultra bajo azufre al contado, promedio del mes. Es el combustible que más pesa en la subvención.',
    ),
    name: 'Diésel, costa del Golfo',
  }),
  bank('GAS_HENRY_HUB', 'Natural gas, US', {
    ...world(
      'ENERGY',
      'NATURAL_GAS',
      'Gas natural',
      'Henry Hub, EE. UU.',
      'US$/MMBtu',
      'Gas natural en EE. UU.',
    ),
    name: 'Gas natural, EE. UU.',
  }),
  bank('GAS_EUROPE', 'Natural gas, Europe', {
    ...world(
      'ENERGY',
      'NATURAL_GAS',
      'Gas natural',
      'TTF, Países Bajos',
      'US$/MMBtu',
      'Gas natural en Europa.',
    ),
    name: 'Gas natural, Europa',
  }),
  bank('LNG_JAPAN', 'Liquefied natural gas, Japan', {
    ...world(
      'ENERGY',
      'NATURAL_GAS',
      'Gas natural',
      'Japón (GNL)',
      'US$/MMBtu',
      'Gas natural licuado en Asia.',
    ),
    name: 'Gas natural licuado, Japón',
  }),
  fred('LPG_PROPANE', 'DPROPANEMBTX', {
    ...world(
      'ENERGY',
      'LPG',
      'GLP (propano)',
      'Mont Belvieu, EE. UU.',
      'US$/galón',
      'El GLP boliviano tiene precio administrado; este es el precio mundial contra el que se mide su subvención.',
    ),
    name: 'Propano (GLP), Mont Belvieu',
  }),
  bank('COAL_AUSTRALIA', 'Coal, Australian', {
    ...world('ENERGY', 'COAL', 'Carbón', 'Newcastle, Australia', 'US$/tonelada', 'Carbón térmico.'),
    name: 'Carbón, Australia',
  }),
  // Minerales y metales
  ...(
    [
      [
        'GOLD',
        'Gold',
        'GOLD',
        'Oro',
        'US$/onza troy',
        'Primer rubro de exportación de Bolivia desde 2023.',
      ],
      ['SILVER', 'Silver', 'SILVER', 'Plata', 'US$/onza troy', 'San Cristóbal y Potosí.'],
      ['ZINC', 'Zinc', 'ZINC', 'Zinc', 'US$/tonelada', 'Bolivia vende concentrado, no metal.'],
      ['LEAD', 'Lead', 'LEAD', 'Plomo', 'US$/tonelada', 'Sale junto al zinc y la plata.'],
      ['TIN', 'Tin', 'TIN', 'Estaño', 'US$/tonelada', 'Huanuni y la fundición de Vinto.'],
      ['COPPER', 'Copper', 'COPPER', 'Cobre', 'US$/tonelada', 'Referencia de los metales básicos.'],
      [
        'IRON_ORE',
        'Iron ore, cfr spot',
        'IRON_ORE',
        'Mineral de hierro',
        'US$/tonelada seca',
        'El Mutún.',
      ],
      [
        'ALUMINUM',
        'Aluminum',
        'ALUMINUM',
        'Aluminio',
        'US$/tonelada',
        'Metal industrial de referencia.',
      ],
    ] as const
  ).map(([code, column, product, label, unit, note]) =>
    bank(code, column, {
      ...world('MINERALS', product, label, 'Bolsa de Metales de Londres', unit, note),
      name: `${label}, precio internacional`,
    }),
  ),
  ppi(
    'STEEL_MILL',
    'WPU1017',
    'MINERALS',
    'STEEL',
    'Acero',
    'Acero, productos de acería (índice EE. UU.)',
  ),
];
