import { videoSnapshotView } from './0105-read-the-live-videos.view';

/**
 * La retrospectiva de los videos de los vendedores (ADR 0031): la vista de la última lectura suma, al final,
 * las tendencias por rubro y mes. `CREATE OR REPLACE VIEW` solo admite columnas nuevas al final, así que la
 * definición se toma de la migración anterior y se le agrega la columna, sin copiarla.
 */

export const previousSnapshotView = videoSnapshotView;

export const snapshotViewWithTrends = videoSnapshotView
  .replace('CREATE VIEW read_models.tiktok_video_snapshot', 'CREATE OR REPLACE VIEW read_models.tiktok_video_snapshot')
  .replace(
    /(\s+ro\.received_at\s+AS analyzed_at)\n/u,
    `$1,
  ro.payload_json -> 'trends'       AS trends
`,
  );

export const dropSnapshotView = 'DROP VIEW IF EXISTS read_models.tiktok_video_snapshot;';

export const snapshotGrants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.tiktok_video_snapshot TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;
