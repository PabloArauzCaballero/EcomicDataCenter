import { bank, world } from './exogenous-spec';
import type { ExogenousSpec } from './exogenous-spec';

/** Agro y ganadería: las cotizaciones mundiales de lo que Bolivia siembra y cría. */
export const AGRO_AND_LIVESTOCK: readonly ExogenousSpec[] = [
  // Agro
  ...(
    [
      [
        'SOYBEANS',
        'Soybeans',
        'SOY',
        'Soya',
        'Soya en grano',
        'US$/tonelada',
        'El primer complejo agroexportador de Bolivia.',
      ],
      [
        'SOYBEAN_MEAL',
        'Soybean meal',
        'SOY',
        'Soya',
        'Torta de soya',
        'US$/tonelada',
        'Lo que Bolivia exporta de verdad: harina y torta.',
      ],
      [
        'SOYBEAN_OIL',
        'Soybean oil',
        'SOY',
        'Soya',
        'Aceite de soya',
        'US$/tonelada',
        'Segundo producto del complejo.',
      ],
      [
        'SUNFLOWER_OIL',
        'Sunflower oil',
        'SUNFLOWER',
        'Girasol',
        'Aceite de girasol',
        'US$/tonelada',
        'Santa Cruz, campaña de invierno.',
      ],
      [
        'MAIZE',
        'Maize',
        'MAIZE',
        'Maíz',
        'Maíz, EE. UU.',
        'US$/tonelada',
        'Alimento de la avicultura boliviana.',
      ],
      [
        'RICE_THAI',
        'Rice, Thai 5% ',
        'RICE',
        'Arroz',
        'Arroz, Tailandia 5 %',
        'US$/tonelada',
        'Referencia mundial del arroz.',
      ],
      [
        'WHEAT_HRW',
        'Wheat, US HRW',
        'WHEAT',
        'Trigo',
        'Trigo duro de invierno, EE. UU.',
        'US$/tonelada',
        'Bolivia importa más de la mitad de su trigo.',
      ],
      [
        'SUGAR_WORLD',
        'Sugar, world',
        'SUGAR',
        'Azúcar',
        'Azúcar, mercado mundial',
        'US$/kg',
        'Bolivia exporta azúcar en años de excedente.',
      ],
      [
        'COFFEE_ARABICA',
        'Coffee, Arabica',
        'COFFEE',
        'Café',
        'Café arábica',
        'US$/kg',
        'Los Yungas y Caranavi producen arábica.',
      ],
      [
        'COCOA',
        'Cocoa',
        'COCOA',
        'Cacao',
        'Cacao en grano',
        'US$/kg',
        'Cacao silvestre y cultivado del Beni y el norte de La Paz.',
      ],
      [
        'BANANA_US',
        'Banana, US',
        'BANANA',
        'Banano y plátano',
        'Banano, importado en EE. UU.',
        'US$/kg',
        'Bolivia exporta banano del Chapare a Argentina.',
      ],
    ] as const
  ).map(([code, column, product, label, name, unit, note]) =>
    bank(code, column, {
      ...world('AGRICULTURE', product, label, 'Mercado mundial', unit, note),
      name,
    }),
  ),
  // Ganadería
  bank('BEEF', 'Beef **', {
    ...world(
      'LIVESTOCK',
      'BEEF',
      'Carne de res',
      'Australia y Nueva Zelanda',
      'US$/kg',
      'Carne bovina, referencia mundial.',
    ),
    name: 'Carne de res, precio internacional',
  }),
  bank('CHICKEN', 'Chicken **', {
    ...world(
      'LIVESTOCK',
      'CHICKEN',
      'Carne de pollo',
      'EE. UU.',
      'US$/kg',
      'Pollo entero, referencia mundial.',
    ),
    name: 'Pollo, precio internacional',
  }),
  bank('FISH_MEAL', 'Fish meal', {
    ...world(
      'LIVESTOCK',
      'FISH',
      'Piscicultura',
      'Perú, Hamburgo',
      'US$/tonelada',
      'No hay precio abierto del pescado de cultivo boliviano; la harina de pescado es su principal insumo de alimento.',
    ),
    name: 'Harina de pescado (alimento)',
  }),
];
