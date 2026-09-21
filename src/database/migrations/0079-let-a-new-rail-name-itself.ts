import type { MigrationContext } from '../migration.types';

/**
 * Lets a new stablecoin series exist without a migration of its own.
 *
 * The model this replaces named its two tokens in a `CASE` and listed its three
 * indicator codes in an `IN`, so USDT and USDC worked and a sixth token was
 * invisible until somebody wrote another migration for it. That ordering is
 * backwards for this particular subject: a rail that opens a boliviano market
 * is interesting precisely in its first weeks, and those are the weeks a
 * migration-shaped dependency costs.
 *
 * So the token is derived from the code — `FX_PARALLEL_<TOKEN>_BOB` — and the
 * codes are matched by that shape. The collector already asks the exchange for
 * five tokens on every run, three of which have never answered with a single
 * advertisement; the day one of them does, its series appears here by itself.
 *
 * Nothing else about the model changes. The pooling, the two medians, the
 * per-venue reduction, the rule that a venue showing one side is dropped, and
 * the decision to publish sides only where the venue resolved them are all the
 * ones migration 0076 documents at length, and they are carried over verbatim.
 * The aggregate `FX_PARALLEL_USD_BOB` still takes its token from the instrument
 * the venue reported and still keeps `side_resolved` false, because its labels
 * are the ones that invert halfway through the archive.
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
      /*
       * The token is read out of the code itself rather than matched against a
       * list of codes: FX_PARALLEL_USDT_BOB yields USDT, FX_PARALLEL_USDS_BOB
       * yields USDS, and a token nobody has thought of yet yields its own name
       * the day its first reading arrives. The previous spelling named two
       * codes explicitly, which meant every new rail needed a migration before
       * its series could exist — and a series that waits for a migration loses
       * exactly the opening days that make a new rail worth watching.
       *
       * The aggregate is excluded from this branch by the guard below, so it
       * keeps taking its token from the instrument the venue reported.
       */
      WHEN indicator_code <> 'FX_PARALLEL_USD_BOB'
        THEN nullif(regexp_replace(indicator_code, '^FX_PARALLEL_(.+)_BOB$', '\\1'), indicator_code)
      ELSE nullif(upper(regexp_replace(instrument, '^.*/', '')), '')
    END AS token,
    /*
     * Whether this reading's side means what the column says it means.
     *
     * True only where the side was derived from the venue's own trade-type
     * field, which is the case for the order books read from the exchange.
     */
    (indicator_code <> 'FX_PARALLEL_USD_BOB') AS side_resolved
  FROM read_models.economic_indicator_reading
  WHERE status = 'PUBLISHED'
    AND NOT superseded
    AND frequency = 'DAILY'
    AND event_date IS NOT NULL
    AND price_side IN ('BUY', 'SELL')
    /*
     * Every parallel-rate series, named by shape instead of one by one, so a
     * token added upstream reaches this model without another migration.
     */
    AND indicator_code ~ '^FX_PARALLEL_[A-Z0-9]+_BOB$'
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
