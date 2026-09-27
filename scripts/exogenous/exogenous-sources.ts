import { AGRO_AND_LIVESTOCK } from './exogenous-agro-livestock';
import { ENERGY_AND_MINERALS } from './exogenous-energy-minerals';
import { INDUSTRY_AND_CONSTRUCTION } from './exogenous-industry-construction';
import type { ExogenousSpec } from './exogenous-spec';

export * from './exogenous-spec';

/**
 * Las series mensuales de cotización mundial y de índice de productor, en el
 * orden de las seis familias. Las de FAO/GIEWS están en sus propios archivos.
 */
export const MONTHLY_SERIES: readonly ExogenousSpec[] = [
  ...ENERGY_AND_MINERALS,
  ...AGRO_AND_LIVESTOCK,
  ...INDUSTRY_AND_CONSTRUCTION,
];
