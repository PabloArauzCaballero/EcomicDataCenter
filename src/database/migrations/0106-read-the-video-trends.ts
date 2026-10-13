import {
  dropSnapshotView,
  previousSnapshotView,
  snapshotGrants,
  snapshotViewWithTrends,
} from '../migration-sql/0106-read-the-video-trends.view';
import type { MigrationContext } from '../migration.types';

/**
 * Adds the monthly trends by rubro to the latest read of the sellers' videos (ADR 0031): the
 * retrospective of the board. The column is appended, so the view keeps its grants and its readers.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(snapshotViewWithTrends);
  await context.sequelize.query(snapshotGrants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  // La columna nueva no se puede quitar con CREATE OR REPLACE: se vuelve a crear la vista anterior.
  await context.sequelize.query(dropSnapshotView);
  await context.sequelize.query(previousSnapshotView);
  await context.sequelize.query(snapshotGrants);
}
