import {
  dropExogenousVersionViews,
  exogenousFactorVersionIndex,
  exogenousFactorVersionView,
  exogenousLegacyVersionView,
  exogenousVersionGrants,
} from '../migration-sql/0101-read-exogenous-factor-versions.view';
import type { MigrationContext } from '../migration.types';

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(exogenousFactorVersionView);
  await context.sequelize.query(exogenousLegacyVersionView);
  await context.sequelize.query(exogenousFactorVersionIndex);
  await context.sequelize.query(exogenousVersionGrants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropExogenousVersionViews);
  await context.sequelize.query(
    'DROP INDEX IF EXISTS intelligence.ix_raw_observation_exogenous_factor_version;',
  );
}
