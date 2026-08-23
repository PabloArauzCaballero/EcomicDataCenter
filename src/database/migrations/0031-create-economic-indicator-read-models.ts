import type { MigrationContext } from '../migration.types';

/**
 * Reporting layer for the measured indicators.
 *
 * They join `read_models`, where this codebase already keeps the shapes meant
 * to be read rather than written, next to `current_observation_value`. A view
 * resolves its reads with the privileges of its owner, so a reporting
 * connection granted only these three can chart the series without ever holding
 * SELECT on `intelligence`.
 *
 * Every statement is idempotent. Each view is dropped before being recreated,
 * so a later change to a definition converges instead of failing on a column
 * mismatch the way `CREATE OR REPLACE VIEW` would, and every grant is guarded
 * on the role existing. Replaying the migration set against a fresh database,
 * or against one that already holds part of this, reaches the same state.
 */

const dropViews = `
DROP VIEW IF EXISTS read_models.exchange_rate_gap;
DROP VIEW IF EXISTS read_models.economic_indicator_daily;
DROP VIEW IF EXISTS read_models.economic_indicator_reading;
`;

/**
 * Grain: one measured value.
 *
 * A market quotation carries two prices, so a claim expands into one row per
 * side rather than being collapsed into one. Provenance travels with every row
 * because a figure whose source cannot be reopened is not reportable.
 */
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
 * Grain: one series point per day.
 *
 * The parallel rate is quoted by several venues at once, so the day's value is
 * their median: it survives a single venue drifting, which an average does not.
 * Dispersion is kept beside it, because a widening spread between venues is
 * itself the signal, and a median over one venue is not the same statement as a
 * median over three.
 *
 * The median is discrete, not interpolated. A reported exchange rate should be
 * a price somebody actually quoted rather than a value halfway between two of
 * them, and `percentile_disc` also keeps the exact numeric type instead of
 * routing money through floating point.
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
    event_date,
    count(*)                                           AS reading_count,
    NULLIF(count(DISTINCT venue), 0)                   AS venue_count,
    percentile_disc(0.5) WITHIN GROUP (ORDER BY value) AS value_median,
    min(value)                                         AS value_min,
    max(value)                                         AS value_max,
    max(value) - min(value)                            AS value_spread,
    max(received_at)                                   AS last_received_at
  FROM published
  GROUP BY indicator_code, price_side, unit, event_date
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
WINDOW series AS (PARTITION BY indicator_code, price_side ORDER BY event_date);
`;

/**
 * The exchange rate gap: how far the market price of a dollar sits from the
 * administered one.
 *
 * In Bolivia this single number carries most of the story about external
 * pressure, so it is served ready to chart rather than re-derived by every
 * consumer, each in a slightly different way. Both sides are exposed instead of
 * one being picked, because which side answers "what does a dollar cost"
 * depends on whether you are buying or selling it; the mid-point is offered for
 * a single headline series. Venue count travels along so a gap computed from
 * one venue is never mistaken for a market-wide one, and is null rather than
 * zero where the indicator has no market behind it at all.
 */
const exchangeRateGapView = `
CREATE VIEW read_models.exchange_rate_gap AS
WITH official AS (
  SELECT event_date, value_median AS official_rate
  FROM read_models.economic_indicator_daily
  WHERE indicator_code = 'FX_OFFICIAL_USD_BOB'
),
parallel AS (
  SELECT
    event_date,
    max(value_median) FILTER (WHERE price_side = 'BUY')  AS parallel_buy,
    max(value_median) FILTER (WHERE price_side = 'SELL') AS parallel_sell,
    max(venue_count)                                     AS venue_count,
    max(value_spread)                                    AS venue_spread
  FROM read_models.economic_indicator_daily
  WHERE indicator_code = 'FX_PARALLEL_USD_BOB'
  GROUP BY event_date
),
joined AS (
  SELECT
    official.event_date,
    official.official_rate,
    parallel.parallel_buy,
    parallel.parallel_sell,
    round((parallel.parallel_buy + parallel.parallel_sell) / 2, 6) AS parallel_mid,
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
  // The schema itself belongs to 0001 and stays: this migration only owns the
  // three views it created.
  await context.sequelize.query(dropViews);
}
