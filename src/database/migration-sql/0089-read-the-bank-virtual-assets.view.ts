/**
 * The virtual-dollar services of the Bolivian banks, opened for reading.
 *
 * One view over the observations the `bank-virtual-assets` seeder writes, on
 * the pattern of migration 0086: read from `intelligence.raw_observation` by
 * its own `dataCategory`, joined to the claim that carries its status and to
 * the artifact that carries the digest.
 *
 * One row per series and day. When a day is read twice with a different
 * figure, the reading kept is the one received last, so a correction replaces
 * what is on screen without erasing the evidence of the reading it replaced.
 */

export const dropBankVirtualAssetView = `
DROP VIEW IF EXISTS read_models.bank_virtual_asset;
`;

export const bankVirtualAssetView = `
CREATE VIEW read_models.bank_virtual_asset AS
SELECT DISTINCT ON (ro.payload_json ->> 'indicatorCode', ro.payload_json ->> 'date')
  ro.payload_json ->> 'indicatorCode'   AS indicator_code,
  ro.payload_json ->> 'bank'            AS bank,
  ro.payload_json ->> 'bankName'        AS bank_name,
  ro.payload_json ->> 'product'         AS product,
  ro.payload_json ->> 'asset'           AS asset,
  ro.payload_json ->> 'kind'            AS kind,
  ro.payload_json ->> 'limit'           AS limit_name,
  ro.payload_json ->> 'unit'            AS unit,
  ro.payload_json ->> 'note'            AS note,
  (ro.payload_json ->> 'date')::date    AS reading_date,
  (ro.payload_json ->> 'value')::numeric AS value,
  ro.payload_json ->> 'basis'           AS basis,
  ro.received_at,
  artifact.original_uri                 AS source_url,
  artifact.sha256                       AS evidence_sha256
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'dataCategory' = 'BANK_VIRTUAL_ASSET'
  AND fc.status = 'PUBLISHED'
  AND fc.superseded_by_claim_id IS NULL
ORDER BY
  ro.payload_json ->> 'indicatorCode',
  ro.payload_json ->> 'date',
  ro.received_at DESC,
  ro.raw_observation_id DESC;
`;

export const bankVirtualAssetIndex = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_bank_virtual_asset
  ON intelligence.raw_observation ((payload_json ->> 'dataCategory'))
  WHERE payload_json ->> 'dataCategory' = 'BANK_VIRTUAL_ASSET';
`;

export const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.bank_virtual_asset TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;
