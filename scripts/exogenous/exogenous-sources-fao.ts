import type { ExogenousGroup, ExogenousSpec } from './exogenous-spec';

/**
 * Las lecturas que FAO/GIEWS republica, con su identificador fijo.
 *
 * Dos clases muy distintas bajo el mismo publicador:
 *
 * - **Precios dentro de Bolivia, en bolivianos.** El INE y el Sistema
 *   Integrado de Información Productiva del Ministerio de Desarrollo Productivo
 *   los levantan en cada ciudad y FAO los reúne en un solo registro mensual.
 *   Son la respuesta a la papa, la quinua, el pollo o la leche, que no tienen
 *   cotización mundial: su precio se forma aquí. Se toma el promedio nacional
 *   donde existe y las tres ciudades del eje.
 * - **Cotizaciones de los vecinos**, en dólares por tonelada: el trigo y el
 *   maíz argentinos (de donde viene la harina que Bolivia importa), la carne
 *   brasileña (con la que compite la exportación cruceña) y los lácteos que
 *   fijan el precio de la leche en polvo.
 *
 * La unidad es la que el mercado usa y no se convierte: el quintal español de
 * 46 kg es como se vende la papa en El Alto, y un precio por kilo derivado aquí
 * sería una cifra que nadie publicó.
 */

const bolivia = (
  code: string,
  uuid: string,
  group: ExogenousGroup,
  product: string,
  productLabel: string,
  item: string,
  market: string,
  unit: string,
  note: string,
): ExogenousSpec => ({
  code: `EXO_BO_${code}`,
  group,
  product,
  productLabel,
  name: `${item}, ${market}`,
  scope: 'BOLIVIA_MARKET',
  market,
  unit,
  kind: 'PRICE',
  note,
  origin: { kind: 'FAO', uuid },
});

const WHOLESALE = 'Precio mayorista (SIIP, Ministerio de Desarrollo Productivo).';
const RETAIL = 'Precio al consumidor (INE).';
const QUINTAL = 'Bs/quintal (46 kg)';

type Row = readonly [string, string, string];

/** Promedio nacional, La Paz, Santa Cruz y Cochabamba, en ese orden. */
function wholesale(
  code: string,
  group: ExogenousGroup,
  product: string,
  label: string,
  item: string,
  unit: string,
  rows: readonly Row[],
): ExogenousSpec[] {
  return rows.map(([suffix, uuid, market]) =>
    bolivia(`${code}_${suffix}`, uuid, group, product, label, item, market, unit, WHOLESALE),
  );
}

const retail = (
  code: string,
  uuid: string,
  group: ExogenousGroup,
  product: string,
  label: string,
  item: string,
  market: string,
  unit: string,
) => bolivia(code, uuid, group, product, label, item, market, unit, RETAIL);

export const FAO_DOMESTIC: readonly ExogenousSpec[] = [
  ...wholesale('POTATO', 'AGRICULTURE', 'POTATO', 'Papa', 'Papa Desirée, mayorista', QUINTAL, [
    ['NATIONAL', '3418d905-0fcc-4cdf-85d5-2a3c0de6c484', 'Promedio nacional'],
    ['LA_PAZ', '8aab93c3-b940-44c7-89a4-e88cdf34aad0', 'La Paz'],
    ['SANTA_CRUZ', 'ee40cfe4-8069-4211-a149-c56d4851883d', 'Santa Cruz'],
    ['COCHABAMBA', '21a5e40b-605f-436c-80df-2c44f4bac0b4', 'Cochabamba'],
  ]),
  ...wholesale('QUINOA', 'AGRICULTURE', 'QUINOA', 'Quinua', 'Quinua, mayorista', QUINTAL, [
    ['NATIONAL', '6ed43cda-91e9-435c-9c63-76dde9c3903c', 'Promedio nacional'],
    ['LA_PAZ', '0e96d94d-0e31-41b1-ba2d-6f5bf34bed65', 'La Paz'],
    ['SANTA_CRUZ', '0bf18386-4f8f-4c69-a17a-9a530c945976', 'Santa Cruz'],
    ['COCHABAMBA', '6365c28c-3790-466c-92c9-c83c44c7b3e8', 'Cochabamba'],
  ]),
  ...wholesale('MAIZE', 'AGRICULTURE', 'MAIZE', 'Maíz', 'Maíz amarillo, mayorista', QUINTAL, [
    ['NATIONAL', '72f3baa1-6e68-44d8-9840-7fef195bd3f4', 'Promedio nacional'],
    ['LA_PAZ', '77b36eee-4579-4aac-a40b-2d4e5c198e27', 'La Paz'],
    ['SANTA_CRUZ', '172d7372-7cde-4fcd-841e-7d3cd58569ff', 'Santa Cruz'],
    ['COCHABAMBA', '073aa226-3629-4bec-99c1-9f450a280262', 'Cochabamba'],
  ]),
  ...wholesale('RICE', 'AGRICULTURE', 'RICE', 'Arroz', 'Arroz de primera, mayorista', QUINTAL, [
    ['NATIONAL', 'd0c53b28-d380-481b-a19c-ffd8233cdd30', 'Promedio nacional'],
    ['LA_PAZ', 'ad042b5d-5013-463c-95ea-6986c79eff80', 'La Paz'],
    ['SANTA_CRUZ', '6c9683dd-73b0-4298-86b5-ba42c413cbed', 'Santa Cruz'],
    ['COCHABAMBA', 'd07783c8-cff4-4220-b39a-3ef40a6b8cb3', 'Cochabamba'],
  ]),
  ...wholesale(
    'WHEAT_FLOUR',
    'AGRICULTURE',
    'WHEAT',
    'Trigo',
    'Harina de trigo importada, mayorista',
    QUINTAL,
    [
      ['NATIONAL', '45ef01a5-e664-4299-8c19-3c737cf9bb17', 'Promedio nacional'],
      ['LA_PAZ', '7d725895-1aa2-4b1c-af08-c61ea51b92b4', 'La Paz'],
      ['SANTA_CRUZ', 'c061e903-0c64-4e53-afe2-988cdbdab45e', 'Santa Cruz'],
      ['COCHABAMBA', 'cd8576e4-e902-454b-abea-46ab179fb811', 'Cochabamba'],
    ],
  ),
  ...wholesale(
    'CHICKEN',
    'LIVESTOCK',
    'CHICKEN',
    'Carne de pollo',
    'Pollo entero, mayorista',
    'Bs/kg',
    [
      ['NATIONAL', 'f9d49e62-4ae2-48ce-bf41-62ca1a9813d3', 'Promedio nacional'],
      ['LA_PAZ', '3867f9c8-1d37-4e9a-94ae-1f6d24b4c730', 'La Paz'],
      ['SANTA_CRUZ', '06664ade-2f8f-40ea-962f-f44d31e35b68', 'Santa Cruz'],
      ['COCHABAMBA', '0b16549f-afc0-4b78-92a3-04deacc85c5c', 'Cochabamba'],
    ],
  ),
  retail(
    'BANANA_LA_PAZ',
    '658b3fc6-350f-4630-9c62-eb61026f2cd8',
    'AGRICULTURE',
    'BANANA',
    'Banano y plátano',
    'Banano',
    'La Paz',
    'Bs/kg',
  ),
  retail(
    'BANANA_SANTA_CRUZ',
    'da3df29d-58f6-4453-9b1a-3ed24c4f73b7',
    'AGRICULTURE',
    'BANANA',
    'Banano y plátano',
    'Banano',
    'Santa Cruz',
    'Bs/kg',
  ),
  retail(
    'SUGAR_SANTA_CRUZ',
    '53463e30-c254-4698-8c18-2ec7906a7b5d',
    'AGRICULTURE',
    'SUGAR',
    'Azúcar',
    'Azúcar',
    'Santa Cruz',
    'Bs/kg',
  ),
  retail(
    'SUGAR_ORURO',
    '372ac15a-2ed1-4904-8d94-1058885ffc7e',
    'AGRICULTURE',
    'SUGAR',
    'Azúcar',
    'Azúcar',
    'Oruro',
    'Bs/kg',
  ),
  retail(
    'SUNFLOWER_OIL_LA_PAZ',
    '2d79f438-7772-49c5-a68e-bc308d379b96',
    'AGRICULTURE',
    'SUNFLOWER',
    'Girasol',
    'Aceite de girasol',
    'La Paz',
    'Bs/botella 0,9 l',
  ),
  retail(
    'SUNFLOWER_OIL_SANTA_CRUZ',
    'f406c9e1-f3ba-4631-9062-cec1cab81ff7',
    'AGRICULTURE',
    'SUNFLOWER',
    'Girasol',
    'Aceite de girasol',
    'Santa Cruz',
    'Bs/botella 0,9 l',
  ),
  retail(
    'EGGS_LA_PAZ',
    '48c8e355-85a8-4dd5-ae17-cc9a19a38a15',
    'LIVESTOCK',
    'EGGS',
    'Huevos',
    'Huevo',
    'La Paz',
    'Bs/unidad',
  ),
  retail(
    'EGGS_SANTA_CRUZ',
    'cd22c0a3-9bf7-41c1-9f5a-86a749c684cd',
    'LIVESTOCK',
    'EGGS',
    'Huevos',
    'Huevo',
    'Santa Cruz',
    'Bs/unidad',
  ),
  retail(
    'MILK_SANTA_CRUZ',
    '55253f8e-d22b-4f62-a123-8b94ab215510',
    'LIVESTOCK',
    'DAIRY',
    'Lácteos',
    'Leche cruda',
    'Santa Cruz',
    'Bs/litro',
  ),
  retail(
    'MILK_SUCRE',
    '4b93359e-c4e1-49cb-86d8-b210c8d52555',
    'LIVESTOCK',
    'DAIRY',
    'Lácteos',
    'Leche cruda',
    'Sucre',
    'Bs/litro',
  ),
];
