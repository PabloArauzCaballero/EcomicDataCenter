import type { MigrationContext } from '../migration.types';

/**
 * Decides, once, which official quotation the gap is measured against.
 *
 * The archived official series carries both sides as its publisher does, while
 * the collector records the single administered rate the central bank's table
 * states. Left as it was, a day with more than one official row was resolved
 * arbitrarily, and the headline figure of the whole observatory would have
 * depended on which row the planner happened to return first.
 *
 * The order is deliberate. `OFFICIAL` is the rate the central bank publishes as
 * the rate, so it wins wherever it exists. Otherwise the gap uses the selling
 * side, because the question the gap answers — how much more does a dollar cost
 * outside the official market — is asked by somebody acquiring dollars, and the
 * selling quotation is what they would pay. The side actually used is reported
 * in the view, so nobody has to infer it.
 *
 * Idempotent like 0031 and 0032: the view is dropped before being recreated.
 */

const dropView = `DROP VIEW IF EXISTS read_models.exchange_rate_gap;`;

const exchangeRateGapView = `
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
    GRANT SELECT ON read_models.exchange_rate_gap TO backend_reader;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
    GRANT SELECT ON read_models.exchange_rate_gap TO backup_operator;
  END IF;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropView);
  await context.sequelize.query(exchangeRateGapView);
  await context.sequelize.query(grantReportingAccess);
}

export async function down({ context }: MigrationContext): Promise<void> {
  // Rolling back leaves the view absent rather than silently restoring the
  // shape from 0032: reapplying that migration is what puts it back.
  await context.sequelize.query(dropView);
}
