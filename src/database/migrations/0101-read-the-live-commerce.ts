import {
  dropLiveCommerceViews,
  liveCommerceCoverageView,
  liveCommerceGrants,
  liveCommerceIndex,
  liveCommercePhraseView,
  liveCommercePriceView,
  liveCommerceRoomView,
  liveCommerceSnapshotView,
  liveCommerceTermView,
} from '../migration-sql/0101-read-the-live-commerce.view';
import type { MigrationContext } from '../migration.types';

/**
 * Opens the TikTok live-selling observations for reading (ADR 0030): one view
 * per live, its prices, each capture night's coverage, and the phrases and
 * terms of the latest analysis.
 *
 * Kept out of the indicator views on purpose, like the company accounts of
 * migration 0094: what a live shows is an observation of a market, not a series
 * of the country, and the seeder writes it without a `measures` array.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropLiveCommerceViews);
  await context.sequelize.query('DROP VIEW IF EXISTS read_models.live_commerce_snapshot;');
  await context.sequelize.query(liveCommerceRoomView);
  await context.sequelize.query(liveCommercePriceView);
  await context.sequelize.query(liveCommerceCoverageView);
  await context.sequelize.query(liveCommercePhraseView);
  await context.sequelize.query(liveCommerceTermView);
  await context.sequelize.query(liveCommerceSnapshotView);
  await context.sequelize.query(liveCommerceIndex);
  await context.sequelize.query(liveCommerceGrants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query('DROP VIEW IF EXISTS read_models.live_commerce_snapshot;');
  await context.sequelize.query(dropLiveCommerceViews);
  await context.sequelize.query(
    'DROP INDEX IF EXISTS intelligence.ix_raw_observation_live_commerce;',
  );
}
