import {
  bcbStatisticCatalogView,
  bcbStatisticDataView,
  bcbStatisticIndexes,
  dropBcbStatisticViews,
  grants,
} from '../migration-sql/0091-read-the-bcb-statistics.view';
import type { MigrationContext } from '../migration.types';

/**
 * Opens the central bank's published statistics for reading: twelve thousand series of
 * reserves, money, prices, rates, the external sector and the payment system, each with
 * its points and the exact sheet and column they came from.
 *
 * Two views and not one. The seeder files a small catalogue observation and a large data
 * observation per series precisely so that the picker can list every series without
 * unpacking any of their points; see the notes on each view.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropBcbStatisticViews);
  await context.sequelize.query(bcbStatisticCatalogView);
  await context.sequelize.query(bcbStatisticDataView);
  await context.sequelize.query(bcbStatisticIndexes);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropBcbStatisticViews);
  await context.sequelize.query(
    'DROP INDEX IF EXISTS intelligence.ix_raw_observation_bcb_catalog;',
  );
  await context.sequelize.query('DROP INDEX IF EXISTS intelligence.ix_raw_observation_bcb_data;');
}
