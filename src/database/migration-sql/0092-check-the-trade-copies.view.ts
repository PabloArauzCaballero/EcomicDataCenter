/**
 * The question «do the three trade copies say what the register holds?», asked
 * of the database itself.
 *
 * Until now the answer lived in the memory of whichever process loaded the
 * blocks: the seeder rebuilt the copies when a block came in, and the API when
 * a copy had never been built. A copy that was built EMPTY — by the API at boot,
 * before the seeder had filed a single block — and whose rebuild then died with
 * the process fell between the two rules. The blocks were committed, so no later
 * load saw anything new; the copy was populated, so the API saw nothing to fill;
 * and the report said the customs base was not loaded for as long as nobody
 * rebuilt it by hand. That was Contabo on 2026-10-01.
 *
 * The state has to be read from the data, not remembered. `trade_flow` keeps the
 * `raw_observation_id` of the block each row was unpacked from, so the copy is
 * current exactly when the blocks it holds are the blocks the view's rule would
 * pick today — the newest published one per flow, grain and year. Product and
 * code lists have no such column, but they are rebuilt together with the flows,
 * so they only need to be non-empty once a catalogue exists.
 *
 * Cost, because this runs on every boot: the register holds about a hundred
 * blocks, found through the partial index 0087 created, so the payload is read
 * once per block rather than once per row; the copy side is an index-only walk
 * of `ux_trade_flow_row`. Seconds, against the minutes a rebuild takes.
 *
 * `SECURITY DEFINER` for the reason 0075 gives for `refresh_snapshot`: the
 * writer is not given SELECT on the copies, and this does not need to change it.
 */
export const tradeCopiesCheck = `
CREATE FUNCTION read_models.trade_copies_are_current()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  unbuilt integer;
  wanted bigint[];
  held bigint[];
BEGIN
  SELECT count(*) INTO unbuilt
    FROM pg_catalog.pg_class class
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
   WHERE namespace.nspname = 'read_models'
     AND class.relkind = 'm'
     AND class.relname IN ('trade_flow', 'trade_product', 'trade_code')
     AND NOT class.relispopulated;
  IF unbuilt > 0 THEN
    RETURN false;
  END IF;

  SELECT COALESCE(array_agg(newest.raw_observation_id ORDER BY newest.raw_observation_id), '{}')
    INTO wanted
    FROM (
      SELECT DISTINCT ON (candidate.flow, candidate.grain, candidate.year)
             candidate.raw_observation_id
        FROM (
          SELECT ro.raw_observation_id,
                 ro.received_at,
                 ro.payload_json ->> 'flow' AS flow,
                 ro.payload_json ->> 'grain' AS grain,
                 (ro.payload_json ->> 'year')::smallint AS year
            FROM intelligence.fact_claim fc
            JOIN intelligence.raw_observation ro
              ON ro.raw_observation_id = fc.raw_observation_id
           WHERE ro.payload_json ->> 'dataCategory' = 'TRADE_RECORD'
             AND fc.status = 'PUBLISHED'
             AND fc.superseded_by_claim_id IS NULL
        ) candidate
       ORDER BY candidate.flow, candidate.grain, candidate.year,
                candidate.received_at DESC, candidate.raw_observation_id DESC
    ) newest;

  SELECT COALESCE(array_agg(block.raw_observation_id ORDER BY block.raw_observation_id), '{}')
    INTO held
    FROM (SELECT DISTINCT raw_observation_id FROM read_models.trade_flow) block;

  IF wanted IS DISTINCT FROM held THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM intelligence.fact_claim fc
      JOIN intelligence.raw_observation ro
        ON ro.raw_observation_id = fc.raw_observation_id
     WHERE ro.payload_json ->> 'dataCategory' = 'TRADE_CATALOGUE'
       AND fc.status = 'PUBLISHED'
       AND fc.superseded_by_claim_id IS NULL
  ) AND (
    NOT EXISTS (SELECT 1 FROM read_models.trade_code)
    OR NOT EXISTS (SELECT 1 FROM read_models.trade_product)
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION read_models.trade_copies_are_current() FROM PUBLIC;
`;

export const tradeCopiesCheckGrants = `
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_writer') THEN
    GRANT USAGE ON SCHEMA read_models TO backend_writer;
    GRANT EXECUTE ON FUNCTION read_models.trade_copies_are_current() TO backend_writer;
  END IF;
END
$$;
`;

export const dropTradeCopiesCheck = `
DROP FUNCTION IF EXISTS read_models.trade_copies_are_current();
`;
