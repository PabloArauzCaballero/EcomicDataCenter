import type { MigrationContext } from '../migration.types';

/**
 * Serves the parallel rate split by the token that was actually traded.
 *
 * The aggregate series answers "what does a dollar cost" with a median across
 * venues that are not quoting the same thing: two of the three report BOB/USDT
 * and the third reports BOB/USD without saying which dollar it means. While
 * there was nothing better that was the right call — a country with one
 * parallel rate needs one number for it — but it leaves the reader unable to
 * ask whether the rails price the dollar differently, which in a country under
 * exchange controls is where the cost of getting money out actually shows.
 *
 * This model keeps the grain the aggregate drops: one row per day per token.
 * `economic_indicator_daily` and `exchange_rate_gap` are deliberately left
 * untouched, so the headline series and the gap the whole report is built on
 * cannot move because of this migration. The two new indicator codes flow into
 * the daily model on their own, because it groups by indicator code.
 *
 * Three decisions in here are methodological rather than technical.
 *
 * **The token series is pooled on the mid-point, never on the sides.** The
 * venue that has served the parallel rate since 2024 publishes two figures
 * labelled `buy` and `sell` whose order inverts halfway through the series, so
 * those labels do not carry the Bolivian convention and cannot be trusted as
 * sides. The order book read from the exchange does carry a resolved side,
 * because the side is derived from the advertisement's own `tradeType`. Pooling
 * the two together per side would let an unlabelled figure into a column that
 * claims to mean "what the reader pays". So the cross-venue figure is the
 * mid-point, which no label swap can change, and the sides are published only
 * from the sources whose sides are resolved — with `sides_resolved` saying
 * which row is which.
 *
 * **The median is taken twice, and the inner one is per venue.** A venue that
 * quotes three times a day would otherwise weigh three times as much as one
 * that quotes once. Each venue is reduced to its own mid for the day first, and
 * the day's figure is the discrete median of those — a price a venue actually
 * quoted, not an average nobody offered.
 *
 * **The token is read from the reading, not assumed from the code.** Readings
 * carried an `instrument` before these series existed, so the history the
 * collector has gathered since it started naming the pair is recovered rather
 * than thrown away. It does not reach back to the archive: the historical
 * backfill recorded no instrument, so this model begins where the collector
 * began stating one, and `read_models.economic_indicator_daily` remains the
 * only place with the full series.
 *
 * Idempotent like the models before it: dropped before being recreated.
 */

const dropView = `DROP VIEW IF EXISTS read_models.stablecoin_parallel_daily;`;

const tokenView = `
CREATE VIEW read_models.stablecoin_parallel_daily AS
WITH published AS (
  SELECT
    event_date,
    indicator_code,
    price_side,
    aggregation,
    venue,
    unit,
    value,
    received_at,
    /*
     * The token, normalised to its own name.
     *
     * The explicit series carry it in the code; the aggregate carries it in the
     * instrument the venue reported, spelled as a pair ("BOB/USDT"). Both are
     * reduced to the token itself so one series does not appear twice under two
     * spellings. A venue that reports a bare "BOB/USD" is left as USD: it is a
     * dollar of unstated kind, and renaming it USDT would be an assumption.
     */
    CASE
      WHEN indicator_code = 'FX_PARALLEL_USDT_BOB' THEN 'USDT'
      WHEN indicator_code = 'FX_PARALLEL_USDC_BOB' THEN 'USDC'
      ELSE nullif(upper(regexp_replace(instrument, '^.*/', '')), '')
    END AS token,
    /*
     * Whether this reading's side means what the column says it means.
     *
     * True only where the side was derived from the venue's own trade-type
     * field, which is the case for the order books read from the exchange.
     */
    (indicator_code IN ('FX_PARALLEL_USDT_BOB', 'FX_PARALLEL_USDC_BOB')) AS side_resolved
  FROM read_models.economic_indicator_reading
  WHERE status = 'PUBLISHED'
    AND NOT superseded
    AND frequency = 'DAILY'
    AND event_date IS NOT NULL
    AND price_side IN ('BUY', 'SELL')
    AND indicator_code IN (
      'FX_PARALLEL_USD_BOB',
      'FX_PARALLEL_USDT_BOB',
      'FX_PARALLEL_USDC_BOB'
    )
),
named AS (
  SELECT * FROM published WHERE token IS NOT NULL
),
-- One figure per venue per side per day, so a venue that quotes often does not
-- outweigh one that quotes once.
by_venue_side AS (
  SELECT
    event_date,
    token,
    aggregation,
    venue,
    price_side,
    bool_or(side_resolved)                             AS side_resolved,
    percentile_disc(0.5) WITHIN GROUP (ORDER BY value) AS value_median,
    count(*)                                           AS reading_count,
    max(received_at)                                   AS last_received_at
  FROM named
  GROUP BY event_date, token, aggregation, venue, price_side
),
-- The venue's own mid-point, which survives a label swap.
by_venue AS (
  SELECT
    event_date,
    token,
    aggregation,
    venue,
    bool_and(side_resolved) AS side_resolved,
    avg(value_median)       AS venue_mid,
    max(value_median) FILTER (WHERE price_side = 'BUY' AND side_resolved)  AS venue_bid,
    max(value_median) FILTER (WHERE price_side = 'SELL' AND side_resolved) AS venue_ask,
    sum(reading_count)      AS reading_count,
    max(last_received_at)   AS last_received_at
  FROM by_venue_side
  GROUP BY event_date, token, aggregation, venue
  -- A venue with only one side has no mid-point, and half a quotation is not a
  -- price. It is dropped rather than doubled into one.
  HAVING count(DISTINCT price_side) = 2
),
daily AS (
  SELECT
    event_date,
    token,
    aggregation,
    count(*)                                               AS venue_count,
    sum(reading_count)                                     AS reading_count,
    bool_or(side_resolved)                                 AS sides_resolved,
    percentile_disc(0.5) WITHIN GROUP (ORDER BY venue_mid) AS mid_median,
    min(venue_mid)                                         AS mid_min,
    max(venue_mid)                                         AS mid_max,
    max(venue_mid) - min(venue_mid)                        AS mid_spread,
    -- Sides only from the venues that resolved them; null where none did.
    percentile_disc(0.5) WITHIN GROUP (ORDER BY venue_bid) AS bid_median,
    percentile_disc(0.5) WITHIN GROUP (ORDER BY venue_ask) AS ask_median,
    max(last_received_at)                                  AS last_received_at
  FROM by_venue
  GROUP BY event_date, token, aggregation
)
SELECT
  daily.*,
  lag(mid_median) OVER series              AS previous_mid_median,
  mid_median - lag(mid_median) OVER series AS change_absolute,
  round(
    (mid_median - lag(mid_median) OVER series)
      / NULLIF(lag(mid_median) OVER series, 0) * 100,
    4
  )                                        AS change_percent
FROM daily
WINDOW series AS (PARTITION BY token, aggregation ORDER BY event_date);
`;

const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.stablecoin_parallel_daily TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropView);
  await context.sequelize.query(tokenView);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropView);
}
