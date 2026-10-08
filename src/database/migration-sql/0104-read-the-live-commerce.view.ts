/**
 * Las ventas en vivo de TikTok, abiertas para leer (ADR 0030).
 *
 * Cinco vistas sobre las observaciones del cargador `tiktok-live`, con el patrón
 * de la migración 0094: se leen de `intelligence.raw_observation` por su
 * `dataCategory`, unidas a la afirmación publicada. Las vistas solo agregan y
 * desarman JSON; la clasificación de cada mensaje ya se hizo una vez al analizar
 * (lección de la 0093: un léxico dentro de una vista se recalcula en cada lectura).
 *
 * - `live_commerce_room`: un live, en su lectura más reciente.
 * - `live_commerce_price`: cada precio de la lectura más reciente de su live.
 * - `live_commerce_coverage`: una noche de captura, en su lectura más reciente.
 * - `live_commerce_phrase` y `live_commerce_term`: las del último análisis.
 */

const published = `
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id`;

const live = `
  AND fc.status = 'PUBLISHED'
  AND fc.superseded_by_claim_id IS NULL`;

export const dropLiveCommerceViews = `
DROP VIEW IF EXISTS read_models.live_commerce_term;
DROP VIEW IF EXISTS read_models.live_commerce_phrase;
DROP VIEW IF EXISTS read_models.live_commerce_coverage;
DROP VIEW IF EXISTS read_models.live_commerce_price;
DROP VIEW IF EXISTS read_models.live_commerce_room;
`;

export const liveCommerceRoomView = `
CREATE VIEW read_models.live_commerce_room AS
SELECT DISTINCT ON (ro.payload_json ->> 'roomKey')
  ro.payload_json ->> 'roomKey'                    AS room_key,
  ro.payload_json ->> 'run'                        AS run_id,
  (ro.payload_json ->> 'date')::date               AS live_date,
  (ro.payload_json ->> 'hour')::integer            AS live_hour,
  (ro.payload_json ->> 'weekday')::integer         AS weekday,
  ro.payload_json ->> 'sellerId'                   AS seller_id,
  ro.payload_json ->> 'status'                     AS live_status,
  ro.payload_json ->> 'rubro'                      AS rubro,
  ro.payload_json ->> 'product'                    AS product,
  ro.payload_json -> 'products'                    AS products,
  ro.payload_json ->> 'city'                       AS city,
  ro.payload_json ->> 'citySource'                 AS city_source,
  (ro.payload_json ->> 'bolivia')::boolean         AS bolivia,
  ro.payload_json ->> 'size'                       AS audience_size,
  (ro.payload_json ->> 'minutes')::integer         AS minutes,
  ro.payload_json ->> 'endReason'                  AS end_reason,
  (ro.payload_json ->> 'viewersPeak')::integer     AS viewers_peak,
  (ro.payload_json ->> 'viewersMedian')::integer   AS viewers_median,
  (ro.payload_json ->> 'entries')::integer         AS entries,
  (ro.payload_json ->> 'messages')::integer        AS messages,
  (ro.payload_json ->> 'authors')::integer         AS authors,
  (ro.payload_json ->> 'buyers')::integer          AS buyers,
  ro.payload_json -> 'signals'                     AS signals,
  ro.payload_json -> 'payments'                    AS payments,
  ro.payload_json -> 'destinations'                AS destinations,
  ro.payload_json -> 'emotions'                    AS emotions,
  ro.payload_json -> 'polarity'                    AS polarity,
  (ro.payload_json ->> 'gifts')::integer           AS gifts,
  (ro.payload_json ->> 'follows')::integer         AS follows,
  (ro.payload_json ->> 'shares')::integer          AS shares,
  (ro.payload_json ->> 'likes')::integer           AS likes,
  (ro.payload_json ->> 'speechSegments')::integer  AS speech_segments,
  (ro.payload_json ->> 'screenReads')::integer     AS screen_reads,
  (ro.payload_json ->> 'prices')::integer          AS prices_found,
  ro.received_at                                   AS analyzed_at
${published}
WHERE ro.payload_json ->> 'dataCategory' = 'LIVE_COMMERCE_ROOM'
${live}
ORDER BY ro.payload_json ->> 'roomKey', ro.received_at DESC, ro.raw_observation_id DESC;
`;

export const liveCommercePriceView = `
CREATE VIEW read_models.live_commerce_price AS
WITH latest AS (
  SELECT DISTINCT ON (ro.payload_json ->> 'roomKey')
    ro.payload_json
  ${published}
  WHERE ro.payload_json ->> 'dataCategory' = 'LIVE_COMMERCE_PRICES'
  ${live}
  ORDER BY ro.payload_json ->> 'roomKey', ro.received_at DESC, ro.raw_observation_id DESC
)
SELECT
  item ->> 'roomKey'                 AS room_key,
  (item ->> 'date')::date            AS price_date,
  item ->> 'rubro'                   AS rubro,
  item ->> 'product'                 AS product,
  item ->> 'productSource'           AS product_source,
  (item ->> 'amount')::numeric       AS amount,
  item ->> 'currency'                AS currency,
  (item ->> 'priceBs')::numeric      AS price_bs,
  item ->> 'unit'                    AS price_unit,
  item ->> 'source'                  AS price_source,
  (item ->> 'explicit')::boolean     AS explicit_currency,
  item ->> 'city'                    AS city
FROM latest
CROSS JOIN LATERAL jsonb_array_elements(latest.payload_json -> 'prices') AS item;
`;

export const liveCommerceCoverageView = `
CREATE VIEW read_models.live_commerce_coverage AS
SELECT DISTINCT ON (ro.payload_json ->> 'run')
  (ro.payload_json ->> 'run')::date                  AS run_date,
  (ro.payload_json ->> 'candidatesSeen')::integer     AS candidates_seen,
  (ro.payload_json ->> 'candidatesLive')::integer     AS candidates_live,
  (ro.payload_json ->> 'roomsOpened')::integer        AS rooms_opened,
  (ro.payload_json ->> 'roomsBlocked')::integer       AS rooms_blocked,
  (ro.payload_json ->> 'roomsCommerce')::integer      AS rooms_commerce,
  (ro.payload_json ->> 'roomsNoCommerce')::integer    AS rooms_no_commerce,
  (ro.payload_json ->> 'roomsForeign')::integer       AS rooms_foreign,
  (ro.payload_json ->> 'roomsUnidentified')::integer  AS rooms_unidentified,
  (ro.payload_json ->> 'messages')::integer           AS messages,
  (ro.payload_json ->> 'messagesWithSignal')::integer AS messages_with_signal,
  (ro.payload_json ->> 'messagesApt')::integer        AS messages_apt,
  (ro.payload_json ->> 'speechSegments')::integer     AS speech_segments,
  (ro.payload_json ->> 'screenReads')::integer        AS screen_reads,
  (ro.payload_json ->> 'prices')::integer             AS prices,
  (ro.payload_json ->> 'minutes')::integer            AS minutes
${published}
WHERE ro.payload_json ->> 'dataCategory' = 'LIVE_COMMERCE_COVERAGE'
${live}
ORDER BY ro.payload_json ->> 'run', ro.received_at DESC, ro.raw_observation_id DESC;
`;

const latestSnapshot = `
  SELECT ro.payload_json, ro.received_at
  ${published}
  WHERE ro.payload_json ->> 'dataCategory' = 'LIVE_COMMERCE_SNAPSHOT'
  ${live}
  ORDER BY ro.received_at DESC, ro.raw_observation_id DESC
  LIMIT 1`;

export const liveCommercePhraseView = `
CREATE VIEW read_models.live_commerce_phrase AS
WITH latest AS (${latestSnapshot})
SELECT
  item ->> 'phrase'                  AS phrase,
  (item ->> 'people')::integer       AS people,
  (item ->> 'lives')::integer        AS lives,
  item ->> 'rubro'                   AS rubro,
  item ->> 'emotion'                 AS emotion,
  item ->> 'signal'                  AS signal,
  latest.payload_json -> 'provenance' AS provenance,
  latest.payload_json -> 'rubros'     AS rubros,
  latest.payload_json -> 'departments' AS departments,
  latest.received_at                  AS analyzed_at
FROM latest
CROSS JOIN LATERAL jsonb_array_elements(latest.payload_json -> 'phrases') AS item;
`;

export const liveCommerceTermView = `
CREATE VIEW read_models.live_commerce_term AS
WITH latest AS (${latestSnapshot})
SELECT
  item ->> 'rubro'                   AS rubro,
  item ->> 'scope'                   AS scope,
  item ->> 'term'                    AS term,
  (item ->> 'count')::integer        AS mentions,
  (item ->> 'rank')::integer         AS term_rank
FROM latest
CROSS JOIN LATERAL jsonb_array_elements(latest.payload_json -> 'terms') AS item;
`;

/** El catálogo de rubros y la procedencia del análisis aunque todavía no haya frases. */
export const liveCommerceSnapshotView = `
CREATE OR REPLACE VIEW read_models.live_commerce_snapshot AS
WITH latest AS (${latestSnapshot})
SELECT
  latest.payload_json -> 'provenance'  AS provenance,
  latest.payload_json -> 'rubros'      AS rubros,
  latest.payload_json -> 'departments' AS departments,
  latest.received_at                   AS analyzed_at
FROM latest;
`;

export const liveCommerceIndex = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_live_commerce
  ON intelligence.raw_observation ((payload_json ->> 'dataCategory'))
  WHERE payload_json ->> 'dataCategory' IN
    ('LIVE_COMMERCE_ROOM', 'LIVE_COMMERCE_PRICES', 'LIVE_COMMERCE_COVERAGE', 'LIVE_COMMERCE_SNAPSHOT');
`;

export const liveCommerceGrants = `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY[
        'live_commerce_room', 'live_commerce_price', 'live_commerce_coverage',
        'live_commerce_phrase', 'live_commerce_term', 'live_commerce_snapshot'
      ] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;
