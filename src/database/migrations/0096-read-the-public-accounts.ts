import {
  dropPublicAccountViews,
  grants,
  publicAccountIndexes,
  publicAccountSeriesView,
} from '../migration-sql/0096-read-the-public-accounts.view';
import type { MigrationContext } from '../migration.types';

/**
 * Opens the public accounts for reading: what the State collects tax by tax, takes in and
 * spends month by month, owes and to whom, and what it spends holding fuel prices down.
 *
 * One view, one row per series with its points inside. Kept out of the indicator views on
 * purpose: these series carry a perimeter (general government, the non-financial public
 * sector, the Treasury) that a country-level indicator code cannot express, and the
 * seeder writes them without a `measures` array so that neither the daily nor the annual
 * panel ever picks them up.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropPublicAccountViews);
  await context.sequelize.query(publicAccountSeriesView);
  await context.sequelize.query(publicAccountIndexes);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropPublicAccountViews);
  await context.sequelize.query(
    'DROP INDEX IF EXISTS intelligence.ix_raw_observation_public_accounts;',
  );
}
