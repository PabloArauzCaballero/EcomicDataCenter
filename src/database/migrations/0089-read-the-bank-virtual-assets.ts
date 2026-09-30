import {
  bankVirtualAssetIndex,
  bankVirtualAssetView,
  dropBankVirtualAssetView,
  grants,
} from '../migration-sql/0089-read-the-bank-virtual-assets.view';
import type { MigrationContext } from '../migration.types';

/**
 * Opens the virtual-dollar services of the Bolivian banks for reading: which
 * bank offers USDT or USDC, since when, and with which limits.
 *
 * A view of its own and not another category in the daily model. These are
 * daily readings of a handful of pages, not quotations: filed under
 * `economic_indicator_daily` they would join the view the front page reads
 * whole on every visit, the one that already runs out of time on the small
 * server. The seeder writes them without a `measures` array precisely so that
 * they stay out of it.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropBankVirtualAssetView);
  await context.sequelize.query(bankVirtualAssetView);
  await context.sequelize.query(bankVirtualAssetIndex);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropBankVirtualAssetView);
  await context.sequelize.query(
    'DROP INDEX IF EXISTS intelligence.ix_raw_observation_bank_virtual_asset;',
  );
}
