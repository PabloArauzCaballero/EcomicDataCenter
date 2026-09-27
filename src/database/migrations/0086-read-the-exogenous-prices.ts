import {
  dropExogenousPriceView,
  exogenousPriceIndex,
  exogenousPriceView,
  grants,
} from '../migration-sql/0086-read-the-exogenous-prices.view';
import type { MigrationContext } from '../migration.types';

/**
 * Opens the prices Bolivia does not set for reading: world quotations, the
 * neighbours' quotations, US producer indices, prices in bolivianos in the
 * country's own markets and the unit value of what it declared at customs.
 *
 * A view of its own and not another prefix in the annual CASE. These are
 * monthly — the annual model would either refuse them or average twelve months
 * into one — and they are not daily either: filed under
 * `economic_indicator_daily`, twenty-five thousand monthly readings would join
 * the view the front page reads whole on every visit, the one that already
 * runs out of time on the small server. The seeder writes them without a
 * `measures` array precisely so that they stay out of both.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropExogenousPriceView);
  await context.sequelize.query(exogenousPriceView);
  await context.sequelize.query(exogenousPriceIndex);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropExogenousPriceView);
  await context.sequelize.query(
    'DROP INDEX IF EXISTS intelligence.ix_raw_observation_exogenous_price;',
  );
}
