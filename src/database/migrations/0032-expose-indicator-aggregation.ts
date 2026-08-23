import type { MigrationContext } from '../migration.types';

/**
 * Separates a reading taken at a moment from a day reduced to one number.
 *
 * The historical series that predates the collector is published as a daily
 * average of the intraday quotes, while the collector records the price at the
 * moment it looked. Both are legitimate and both belong on the same chart, but
 * they are different statistics: drawing them as one line without saying so
 * would put a seam in the middle of the year that nobody could see.
 *
 * The views therefore carry `aggregation` through, the daily series groups on
 * it so the two never average together, and the gap prefers the directly
 * observed reading on any day that has both.
 *
 * Idempotent like 0031: every view is dropped before being recreated, so
 * replaying the migration set converges instead of failing on a column that
 * changed shape.
 */

const dropViews = `
DROP VIEW IF EXISTS read_models.exchange_rate_gap;
DROP VIEW IF EXISTS read_models.economic_indicator_daily;
DROP VIEW IF EXISTS read_models.economic_indicator_reading;
`;

/** Grain: one measured value, now stating how it was reduced to that value. */
const indicatorReadingView = `
CREATE VIEW read_models.economic_indicator_reading AS
SELECT
  fc.fact_claim_id,
  ro.raw_observation_id,
  fc.agent_run_id,
  fc.event_date,
  fc.published_at,
  ro.received_at,
  ro.payload_json ->> 'dataCategory'                 AS data_category,
  measure ->> 'indicatorCode'                        AS indicator_code,
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
  AND measure ->> 'value' ~ '^-?[0-9]+([.][0-9]+)?$';
`;

/**
 * Grain: one series point per day, per indicator, side and aggregation.
 *
 * A day the collector covered and the archive also covers yields two rows, one
 * per statistic, rather than one number that is neither.
 */
const indicatorDailyView = `
CREATE VIEW read_models.economic_indicator_daily AS
WITH published AS (
  SELECT *
  FROM read_models.economic_indicator_reading
  WHERE status = 'PUBLISHED'
    AND NOT superseded
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

/**
 * The exchange rate gap, one row per day.
 *
 * Where a day carries both a collected reading and an archived average, the
 * collected one wins: it is the price actually observed rather than a day
 * summarised after the fact. The aggregation behind each side is reported, so a
 * gap computed from archived figures is never mistaken for a live one.
 */
const exchangeRateGapView = `
CREATE VIEW read_models.exchange_rate_gap AS
WITH official AS (
  SELECT DISTINCT ON (event_date)
    event_date,
    value_median AS official_rate,
    aggregation  AS official_aggregation
  FROM read_models.economic_indicator_daily
  WHERE indicator_code = 'FX_OFFICIAL_USD_BOB'
  ORDER BY event_date, (aggregation = 'POINT_IN_TIME') DESC
),
parallel_side AS (
  SELECT DISTINCT ON (event_date, price_side)
    event_date,
    price_side,
    value_median,
    value_spread,
    venue_count,
    aggregation
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
  round((parallel_buy - official_rate) / NULLIF(official_rate, 0) * 100, 4)
    AS gap_buy_percent,
  round((parallel_sell - official_rate) / NULLIF(official_rate, 0) * 100, 4)
    AS gap_sell_percent,
  round((parallel_mid - official_rate) / NULLIF(official_rate, 0) * 100, 4)
    AS gap_mid_percent
FROM joined;
`;

const grantReportingAccess = `
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_reader') THEN
    GRANT SELECT ON
      read_models.economic_indicator_reading,
      read_models.economic_indicator_daily,
      read_models.exchange_rate_gap
      TO backend_reader;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
    GRANT SELECT ON
      read_models.economic_indicator_reading,
      read_models.economic_indicator_daily,
      read_models.exchange_rate_gap
      TO backup_operator;
  END IF;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropViews);
  await context.sequelize.query(indicatorReadingView);
  await context.sequelize.query(indicatorDailyView);
  await context.sequelize.query(exchangeRateGapView);
  await context.sequelize.query(grantReportingAccess);
}

export async function down({ context }: MigrationContext): Promise<void> {
  // Rolling back leaves the views absent rather than silently restoring the
  // shape from 0031: reapplying that migration is what puts them back.
  await context.sequelize.query(dropViews);
}
