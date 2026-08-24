import type { MigrationContext } from '../migration.types';

/**
 * Keeps an annual figure out of a daily series.
 *
 * The observatory now carries macroeconomic aggregates published once a year
 * alongside exchange rates quoted every day. Both are readings and both live in
 * the same governed tables, but a yearly figure landing in a view whose grain is
 * a day would be charted on a daily axis, counted as a day's reading and, where
 * an indicator had several, averaged with prices. The frequency travels with
 * every row, the daily models take only what is daily, and the annual series
 * gets a model of its own keyed by the period it describes.
 *
 * Idempotent like the migrations before it: each view is dropped before being
 * recreated, in dependency order.
 */

const dropViews = `
DROP VIEW IF EXISTS read_models.macro_indicator_annual;
DROP VIEW IF EXISTS read_models.exchange_rate_gap;
DROP VIEW IF EXISTS read_models.economic_indicator_daily;
DROP VIEW IF EXISTS read_models.economic_indicator_reading;
`;

/** Grain: one measured value, now stating its frequency and the period it covers. */
const readingView = `
CREATE VIEW read_models.economic_indicator_reading AS
SELECT
  fc.fact_claim_id,
  ro.raw_observation_id,
  fc.agent_run_id,
  fc.event_date,
  fc.published_at,
  ro.received_at,
  ro.payload_json ->> 'dataCategory'                 AS data_category,
  COALESCE(ro.payload_json ->> 'frequency', 'DAILY') AS frequency,
  ro.payload_json ->> 'period'                       AS period,
  measure ->> 'indicatorCode'                        AS indicator_code,
  ro.payload_json ->> 'indicatorName'                AS indicator_name,
  NULLIF(measure ->> 'priceSide', '')                AS price_side,
  (measure ->> 'value')::numeric                     AS value,
  measure ->> 'unit'                                 AS unit,
  COALESCE(ro.payload_json ->> 'aggregation', 'POINT_IN_TIME') AS aggregation,
  ro.payload_json ->> 'instrument'                   AS instrument,
  ro.payload_json ->> 'venue'                        AS venue,
  ro.payload_json ->> 'publisher'                    AS publisher,
  (ro.payload_json ->> 'publisherVerified')::boolean AS publisher_verified,
  ro.payload_json ->> 'url'                          AS source_url,
  ro.payload_json ->> 'sha256'                       AS evidence_sha256,
  ro.payload_json ->> 'storageUri'                   AS evidence_storage_uri,
  fc.claim_type,
  fc.confidence_level,
  fc.confidence_score::numeric                       AS confidence_score,
  fc.impact_level,
  fc.status,
  (fc.superseded_by_claim_id IS NOT NULL)            AS superseded,
  fc.assertion
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
CROSS JOIN LATERAL jsonb_array_elements(ro.payload_json -> 'measures') AS measure
WHERE jsonb_typeof(ro.payload_json -> 'measures') = 'array'
  AND measure ->> 'indicatorCode' IS NOT NULL
  AND measure ->> 'value' ~ '^-?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$';
`;

/** Grain: one series point per day. Annual figures are not days. */
const dailyView = `
CREATE VIEW read_models.economic_indicator_daily AS
WITH published AS (
  SELECT *
  FROM read_models.economic_indicator_reading
  WHERE status = 'PUBLISHED'
    AND NOT superseded
    AND frequency = 'DAILY'
    AND event_date IS NOT NULL
),
daily AS (
  SELECT
    indicator_code,
    price_side,
    unit,
    aggregation,
    event_date,
    count(*)                                           AS reading_count,
    NULLIF(count(DISTINCT venue), 0)                   AS venue_count,
    percentile_disc(0.5) WITHIN GROUP (ORDER BY value) AS value_median,
    min(value)                                         AS value_min,
    max(value)                                         AS value_max,
    max(value) - min(value)                            AS value_spread,
    max(received_at)                                   AS last_received_at
  FROM published
  GROUP BY indicator_code, price_side, unit, aggregation, event_date
)
SELECT
  daily.*,
  lag(value_median) OVER series                AS previous_value_median,
  value_median - lag(value_median) OVER series AS change_absolute,
  round(
    (value_median - lag(value_median) OVER series)
      / NULLIF(lag(value_median) OVER series, 0) * 100,
    4
  )                                            AS change_percent
FROM daily
WINDOW series AS (
  PARTITION BY indicator_code, price_side, aggregation ORDER BY event_date
);
`;

/** Unchanged from 0033; recreated because it depends on the daily model. */
const gapView = `
CREATE VIEW read_models.exchange_rate_gap AS
WITH official AS (
  SELECT DISTINCT ON (event_date)
    event_date,
    value_median AS official_rate,
    price_side   AS official_price_side,
    aggregation  AS official_aggregation
  FROM read_models.economic_indicator_daily
  WHERE indicator_code = 'FX_OFFICIAL_USD_BOB'
  ORDER BY
    event_date,
    (price_side = 'OFFICIAL') DESC,
    (price_side = 'SELL') DESC,
    (aggregation = 'POINT_IN_TIME') DESC
),
parallel_side AS (
  SELECT DISTINCT ON (event_date, price_side)
    event_date, price_side, value_median, value_spread, venue_count, aggregation
  FROM read_models.economic_indicator_daily
  WHERE indicator_code = 'FX_PARALLEL_USD_BOB'
  ORDER BY event_date, price_side, (aggregation = 'POINT_IN_TIME') DESC
),
parallel AS (
  SELECT
    event_date,
    max(value_median) FILTER (WHERE price_side = 'BUY')  AS parallel_buy,
    max(value_median) FILTER (WHERE price_side = 'SELL') AS parallel_sell,
    max(venue_count)                                     AS venue_count,
    max(value_spread)                                    AS venue_spread,
    min(aggregation)                                     AS parallel_aggregation
  FROM parallel_side
  GROUP BY event_date
),
joined AS (
  SELECT
    official.event_date,
    official.official_rate,
    official.official_price_side,
    official.official_aggregation,
    parallel.parallel_buy,
    parallel.parallel_sell,
    round((parallel.parallel_buy + parallel.parallel_sell) / 2, 6) AS parallel_mid,
    parallel.parallel_aggregation,
    parallel.venue_count,
    parallel.venue_spread
  FROM official
  JOIN parallel USING (event_date)
)
SELECT
  joined.*,
  parallel_buy - official_rate  AS gap_buy_absolute,
  parallel_sell - official_rate AS gap_sell_absolute,
  parallel_mid - official_rate  AS gap_mid_absolute,
  round((parallel_buy - official_rate) / NULLIF(official_rate, 0) * 100, 4)  AS gap_buy_percent,
  round((parallel_sell - official_rate) / NULLIF(official_rate, 0) * 100, 4) AS gap_sell_percent,
  round((parallel_mid - official_rate) / NULLIF(official_rate, 0) * 100, 4)  AS gap_mid_percent
FROM joined;
`;

/**
 * Grain: one indicator per year.
 *
 * The change is stated against the previous published year rather than the
 * previous row, so a gap in the series does not read as a year-on-year figure
 * it is not.
 */
const annualView = `
CREATE VIEW read_models.macro_indicator_annual AS
WITH published AS (
  SELECT
    indicator_code,
    max(indicator_name)   AS indicator_name,
    period,
    unit,
    max(publisher)        AS publisher,
    max(source_url)       AS source_url,
    max(evidence_sha256)  AS evidence_sha256,
    max(event_date)       AS period_end,
    avg(value)            AS value
  FROM read_models.economic_indicator_reading
  WHERE status = 'PUBLISHED'
    AND NOT superseded
    AND frequency = 'ANNUAL'
    AND period IS NOT NULL
  GROUP BY indicator_code, period, unit
)
SELECT
  published.*,
  lag(value) OVER series                AS previous_value,
  value - lag(value) OVER series        AS change_absolute,
  round(
    (value - lag(value) OVER series) / NULLIF(abs(lag(value) OVER series), 0) * 100,
    4
  )                                     AS change_percent
FROM published
WINDOW series AS (PARTITION BY indicator_code ORDER BY period);
`;

const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'GRANT SELECT ON read_models.economic_indicator_reading,
                        read_models.economic_indicator_daily,
                        read_models.exchange_rate_gap,
                        read_models.macro_indicator_annual TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropViews);
  await context.sequelize.query(readingView);
  await context.sequelize.query(dailyView);
  await context.sequelize.query(gapView);
  await context.sequelize.query(annualView);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  // Rolling back leaves the views absent; reapplying the earlier migrations is
  // what restores the shape they defined.
  await context.sequelize.query(dropViews);
}
