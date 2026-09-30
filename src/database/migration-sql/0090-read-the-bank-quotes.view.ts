/**
 * The virtual-dollar services of the banks, with the side of a quotation.
 *
 * Migration 0089 opened `read_models.bank_virtual_asset` for the service and
 * its limits. A quotation — what the bank charges or pays per token — needs to
 * say from whose side it is read, and that is one more field of the same
 * payload. A migration already applied is never rewritten, so the view is
 * created again here with the extra column at the end; nothing that reads it
 * by name changes.
 */

export const dropBankVirtualAssetView = `
DROP VIEW IF EXISTS read_models.bank_virtual_asset;
`;

export const bankVirtualAssetViewWithSide = `
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
  artifact.sha256                       AS evidence_sha256,
  ro.payload_json ->> 'side'            AS side
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
