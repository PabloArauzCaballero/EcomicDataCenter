/**
 * The prices Bolivia does not set, opened for reading.
 *
 * One view over the observations the `exogenous-prices` seeder writes, on the
 * pattern migration 0083 set for the road network: read from
 * `intelligence.raw_observation` by its own `dataCategory`, joined to the
 * claim that carries its status and to the artifact that carries the digest.
 *
 * One row per series and period. A publisher that revises a month — the World
 * Bank revises the last few every edition — arrives as a second observation
 * with a new payload hash, and the reading kept is the one received last, so
 * a revision replaces the figure on screen without erasing the one it
 * replaced from the evidence.
 */

export const dropExogenousPriceView = `
DROP VIEW IF EXISTS read_models.exogenous_price;
`;

export const exogenousPriceView = `
CREATE VIEW read_models.exogenous_price AS
SELECT DISTINCT ON (ro.payload_json ->> 'indicatorCode', ro.payload_json ->> 'period')
  ro.payload_json ->> 'indicatorCode'          AS indicator_code,
  ro.payload_json ->> 'group'                  AS exogenous_group,
  ro.payload_json ->> 'product'                AS product,
  ro.payload_json ->> 'productLabel'           AS product_label,
  ro.payload_json ->> 'name'                   AS name,
  ro.payload_json ->> 'scope'                  AS scope,
  ro.payload_json ->> 'market'                 AS market,
  ro.payload_json ->> 'unit'                   AS unit,
  ro.payload_json ->> 'kind'                   AS kind,
  ro.payload_json ->> 'frequency'              AS frequency,
  ro.payload_json ->> 'publisher'              AS publisher,
  ro.payload_json ->> 'note'                   AS note,
  ro.payload_json ->> 'period'                 AS period,
  (ro.payload_json ->> 'value')::numeric         AS value,
  (ro.payload_json ->> 'tradeValueUsd')::numeric AS trade_value_usd,
  (ro.payload_json ->> 'netWeightKg')::numeric   AS net_weight_kg,
  fc.event_date,
  ro.received_at,
  artifact.original_uri                        AS source_url,
  artifact.sha256                              AS evidence_sha256
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'dataCategory' = 'EXOGENOUS_PRICE'
  AND fc.status = 'PUBLISHED'
  AND fc.superseded_by_claim_id IS NULL
ORDER BY
  ro.payload_json ->> 'indicatorCode',
  ro.payload_json ->> 'period',
  ro.received_at DESC,
  ro.raw_observation_id DESC;
`;

export const exogenousPriceIndex = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_exogenous_price
  ON intelligence.raw_observation ((payload_json ->> 'dataCategory'))
  WHERE payload_json ->> 'dataCategory' = 'EXOGENOUS_PRICE';
`;

export const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.exogenous_price TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;
