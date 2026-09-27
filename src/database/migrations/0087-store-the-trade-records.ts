import {
  dropTradeModels,
  tradeCodeSnapshot,
  tradeFlowSnapshot,
  tradeGrants,
  tradeIndexes,
  tradeProductSnapshot,
} from '../migration-sql/0087-store-the-trade-records.view';
import type { MigrationContext } from '../migration.types';

/**
 * Opens the statistics institute's customs register for reading.
 *
 * Until now the external sector on the dashboard was the total Bolivia declares
 * to the United Nations and its twenty largest partners and chapters, one
 * figure a year. The institute publishes the declarations themselves — NANDINA
 * line of ten digits, country, department, month, weight and value — and the
 * `ine-trade` seeder files them as one block per flow, grain and year. Three
 * stored copies lay those blocks out as rows a report can filter and group:
 * the flows, the products with their classifications, and the code lists.
 *
 * Stored copies and not plain views because the flows are over a million rows
 * unpacked from JSON; a plain view would unpack them on every visit.
 */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropTradeModels);
  await context.sequelize.query(tradeFlowSnapshot);
  await context.sequelize.query(tradeProductSnapshot);
  await context.sequelize.query(tradeCodeSnapshot);
  await context.sequelize.query(tradeIndexes);
  await context.sequelize.query(tradeGrants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropTradeModels);
  await context.sequelize.query(
    'DROP INDEX IF EXISTS intelligence.ix_raw_observation_trade_record;',
  );
}
