import {
  dropVideoViews,
  previousRoomView,
  roomViewWithCurve,
  videoAccountView,
  videoGrants,
  videoIndex,
  videoSnapshotView,
  videoView,
} from '../migration-sql/0102-read-the-live-videos.view';
import type { MigrationContext } from '../migration.types';

/**
 * Adds the viewer curve and the dollar mentions to each TikTok live, and opens the sellers' videos
 * for reading in views of their own (ADR 0030 and 0031). A video is not a live: the two catalogues
 * are never mixed.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(roomViewWithCurve);
  await context.sequelize.query(dropVideoViews);
  await context.sequelize.query(videoAccountView);
  await context.sequelize.query(videoView);
  await context.sequelize.query(videoSnapshotView);
  await context.sequelize.query(videoIndex);
  await context.sequelize.query(videoGrants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropVideoViews);
  await context.sequelize.query(
    'DROP INDEX IF EXISTS intelligence.ix_raw_observation_tiktok_video;',
  );
  // Las columnas nuevas no se pueden quitar con CREATE OR REPLACE: se vuelve a crear la vista anterior.
  await context.sequelize.query('DROP VIEW IF EXISTS read_models.live_commerce_room;');
  await context.sequelize.query(previousRoomView);
  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_reader') THEN
    GRANT SELECT ON read_models.live_commerce_room TO backend_reader;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
    GRANT SELECT ON read_models.live_commerce_room TO backup_operator;
  END IF;
END;
$$;`);
}
