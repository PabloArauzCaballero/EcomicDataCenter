import type { Transaction } from 'sequelize';
import { loadRegisters, type Register } from './boot-seed.annual-register';

/**
 * El tejido empresarial: el registro de comercio, el padrón y el ránking de
 * Impuestos, «Las 500» y lo que se sabe de los dueños.
 *
 * Mismo cargador y mismo esquema que los registros anuales —cada cifra es una
 * serie anual con su celda como prueba— y tres catálogos aparte por la razón
 * que ya dio el producto por actividad: **un catálogo es una transacción**, y
 * son decenas de miles de lecturas. Separados, cada uno entra o no entra por su
 * cuenta y se puede pedir solo con `--only=`.
 *
 * Los recoge el mismo agente que el registro empresarial de 2026-09: son el
 * mismo capítulo con más fuentes, y la categoría de cada archivo dice de cuál
 * vienen.
 */

const AGENT = 'CORPORATE_REGISTER_BACKFILL';

export const BUSINESS_REGISTRY: readonly Register[] = [
  { file: 'boot/business-registry.json', agentCode: AGENT, dataCategory: 'BUSINESS_REGISTRY' },
  { file: 'boot/business-registry-flows.json', agentCode: AGENT, dataCategory: 'BUSINESS_REGISTRY' },
  { file: 'boot/business-size.json', agentCode: AGENT, dataCategory: 'BUSINESS_REGISTRY' },
  { file: 'boot/tax-roll.json', agentCode: AGENT, dataCategory: 'TAX_ROLL' },
];

export const BUSINESS_RANKINGS: readonly Register[] = [
  { file: 'boot/tax-top-payers.json', agentCode: AGENT, dataCategory: 'TAX_ROLL' },
];

export const BUSINESS_WEALTH: readonly Register[] = [
  { file: 'boot/wealth-benchmarks.json', agentCode: AGENT, dataCategory: 'WEALTH' },
  { file: 'boot/company-ownership.json', agentCode: AGENT, dataCategory: 'CORPORATE_OWNERSHIP' },
];

/** Cuántas empresas hay, de qué tipo, dónde y de qué tamaño, y el padrón de Impuestos. */
export async function reconcileBusinessRegistry(sourceId: string, transaction: Transaction): Promise<void> {
  await loadRegisters(BUSINESS_REGISTRY, sourceId, transaction);
}

/** Las cien que más impuestos pagan y «Las 500», año a año. */
export async function reconcileBusinessRankings(sourceId: string, transaction: Transaction): Promise<void> {
  await loadRegisters(BUSINESS_RANKINGS, sourceId, transaction);
}

/** Fortunas publicadas, el impuesto a las grandes fortunas, múltiplos de mercado y participaciones. */
export async function reconcileBusinessWealth(sourceId: string, transaction: Transaction): Promise<void> {
  await loadRegisters(BUSINESS_WEALTH, sourceId, transaction);
}
