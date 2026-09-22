import {
  channelMixView,
  coverageView,
  gapView,
} from '../migration-sql/0065-read-trade-by-form.panels';
import { commerceView } from '../migration-sql/0065-read-trade-by-form.view';
import {
  commerceGrants,
  commerceRegisterView,
  commerceSnapshot,
  commerceSnapshotIndexes,
  dropCommerceRegister,
} from '../migration-sql/0069-retire-platform-analytics.view';
import type { MigrationContext } from '../migration.types';

/**
 * Retires the platform analytics and keeps the commerce register they shared.
 *
 * Migration 0062 opened one register for four subjects: declared audiences,
 * trending topics, monitored emotion and commerce. Three of them described
 * platforms; the fourth describes markets, and ADR 0023 had already widened it
 * to cover ferias, tiendas de barrio, catálogo, contrabando and cuenta propia —
 * the forms through which most of Bolivia's trade actually happens.
 *
 * ADR 0025 keeps the fourth and drops the other three. What they cost was never
 * collection — there is no collector, because no legitimate route to one exists
 * — but attention and surface: a register whose declared reach exceeds the
 * adult population invites every reader to mistake a commercial ceiling for
 * penetration, and `social_platform_audience` existed only to warn about that.
 * Removing the readings removes the need for the warning.
 *
 * Three things follow, and the order matters because each depends on the one
 * before it:
 *
 * 1. `social_reading` is rebuilt admitting only COMMERCE, and without
 *    `emotional_register` — a derivation that filed monitored reactions and has
 *    nothing to read in a household panel.
 * 2. `social_platform_audience` is dropped outright. It was the audience model.
 * 3. The commerce views of 0065 are replayed verbatim on top of the narrowed
 *    register. Their definitions do not change here, so they are imported from
 *    that migration's own snapshot rather than copied: what changed is what
 *    feeds them, not how they file it.
 *
 * The retired readings are not deleted. They stay in `intelligence.raw_observation`
 * and `intelligence.fact_claim` with their evidence, because raw data and audit
 * are immutable in this system — a correction narrows what is served, and the
 * record of what was received survives it.
 *
 * See docs/decisions/0025-the-register-reads-commerce-not-platforms.md.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropCommerceRegister);
  await context.sequelize.query(commerceRegisterView);
  await context.sequelize.query(commerceView);
  await context.sequelize.query(channelMixView);
  await context.sequelize.query(coverageView);
  await context.sequelize.query(gapView);
  await context.sequelize.query(commerceSnapshot);
  await context.sequelize.query(commerceSnapshotIndexes);
  await context.sequelize.query(commerceGrants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropCommerceRegister);
}
