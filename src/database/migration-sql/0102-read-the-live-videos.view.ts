import { liveCommerceRoomView } from './0101-read-the-live-commerce.view';

/**
 * Dos cosas de la investigación de lives de TikTok (ADR 0030 y 0031):
 *
 * 1. La vista de cada live suma, al final, la curva de espectadores por minuto y las menciones del
 *    dólar en el chat. `CREATE OR REPLACE VIEW` solo admite columnas nuevas al final, así que la
 *    definición se toma de la migración anterior y se le agregan las dos, sin copiarla.
 * 2. Los videos de los vendedores, en vistas propias: un video no es un live y no se mezcla.
 */

const published = `
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id`;

const live = `
  AND fc.status = 'PUBLISHED'
  AND fc.superseded_by_claim_id IS NULL`;

const lastColumn = /(\s+ro\.received_at\s+AS analyzed_at)\n/u;

export const previousRoomView = liveCommerceRoomView;

export const roomViewWithCurve = liveCommerceRoomView
  .replace(
    'CREATE VIEW read_models.live_commerce_room',
    'CREATE OR REPLACE VIEW read_models.live_commerce_room',
  )
  .replace(
    lastColumn,
    `$1,
  ro.payload_json -> 'curve'                       AS viewer_curve,
  (ro.payload_json ->> 'dollarTalk')::integer      AS dollar_talk
`,
  );

export const dropVideoViews = `
DROP VIEW IF EXISTS read_models.tiktok_video_snapshot;
DROP VIEW IF EXISTS read_models.tiktok_video;
DROP VIEW IF EXISTS read_models.tiktok_video_account;
`;

export const videoAccountView = `
CREATE VIEW read_models.tiktok_video_account AS
SELECT DISTINCT ON (ro.payload_json ->> 'sellerId')
  ro.payload_json ->> 'sellerId'                  AS seller_id,
  ro.payload_json ->> 'origin'                    AS origin,
  ro.payload_json ->> 'kind'                      AS kind,
  ro.payload_json ->> 'rubro'                     AS rubro,
  ro.payload_json ->> 'city'                      AS city,
  (ro.payload_json ->> 'followers')::bigint       AS followers,
  (ro.payload_json ->> 'hearts')::bigint          AS hearts,
  (ro.payload_json ->> 'videoCount')::integer     AS video_count,
  (ro.payload_json ->> 'videosRead')::integer     AS videos_read,
  (ro.payload_json ->> 'firstVideo')::date        AS first_video,
  (ro.payload_json ->> 'lastVideo')::date         AS last_video,
  (ro.payload_json ->> 'date')::date              AS read_date
${published}
WHERE ro.payload_json ->> 'dataCategory' = 'TIKTOK_VIDEO_ACCOUNT'
${live}
ORDER BY ro.payload_json ->> 'sellerId', ro.received_at DESC, ro.raw_observation_id DESC;
`;

export const videoView = `
CREATE VIEW read_models.tiktok_video AS
WITH latest AS (
  SELECT DISTINCT ON (ro.payload_json ->> 'sellerId')
    ro.payload_json
  ${published}
  WHERE ro.payload_json ->> 'dataCategory' = 'TIKTOK_VIDEO_ACCOUNT'
  ${live}
  ORDER BY ro.payload_json ->> 'sellerId', ro.received_at DESC, ro.raw_observation_id DESC
)
SELECT
  item ->> 'videoKey'                 AS video_key,
  item ->> 'sellerId'                 AS seller_id,
  item ->> 'kind'                     AS kind,
  (item ->> 'date')::date             AS published_on,
  (item ->> 'hour')::integer          AS published_hour,
  (item ->> 'weekday')::integer       AS weekday,
  item ->> 'rubro'                    AS rubro,
  item ->> 'product'                  AS product,
  item -> 'prices'                    AS prices_bs,
  (item ->> 'plays')::bigint          AS plays,
  (item ->> 'likes')::bigint          AS likes,
  (item ->> 'comments')::bigint       AS comments,
  (item ->> 'shares')::bigint         AS shares,
  (item ->> 'saves')::bigint          AS saves,
  (item ->> 'duration')::integer      AS duration_seconds,
  (item ->> 'photo')::boolean         AS photo_post,
  (item ->> 'ad')::boolean            AS advertisement,
  item -> 'tactics'                   AS tactics,
  (item ->> 'readOn')::date           AS read_on
FROM latest
CROSS JOIN LATERAL jsonb_array_elements(latest.payload_json -> 'videos') AS item;
`;

export const videoSnapshotView = `
CREATE VIEW read_models.tiktok_video_snapshot AS
SELECT
  ro.payload_json -> 'provenance'   AS provenance,
  ro.payload_json -> 'rubros'       AS rubros,
  ro.payload_json -> 'departments'  AS departments,
  ro.payload_json -> 'terms'        AS terms,
  ro.payload_json -> 'coverage'     AS coverage,
  ro.received_at                    AS analyzed_at
${published}
WHERE ro.payload_json ->> 'dataCategory' = 'TIKTOK_VIDEO_SNAPSHOT'
${live}
ORDER BY ro.received_at DESC, ro.raw_observation_id DESC
LIMIT 1;
`;

export const videoIndex = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_tiktok_video
  ON intelligence.raw_observation ((payload_json ->> 'dataCategory'))
  WHERE payload_json ->> 'dataCategory' IN ('TIKTOK_VIDEO_ACCOUNT', 'TIKTOK_VIDEO_SNAPSHOT');
`;

export const videoGrants = `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY[
        'live_commerce_room', 'tiktok_video_account', 'tiktok_video', 'tiktok_video_snapshot'
      ] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;
