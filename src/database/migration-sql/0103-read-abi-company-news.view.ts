export const createAbiNews = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_abi_key
ON intelligence.raw_observation ((payload_json ->> 'abiKey'), raw_observation_id DESC)
WHERE payload_json ->> 'abiKey' IS NOT NULL;

CREATE VIEW read_models.abi_article AS
SELECT DISTINCT ON (ro.payload_json ->> 'abiKey')
  ro.payload_json ->> 'abiKey' AS article_key,
  ro.payload_json -> 'abi' AS article,
  fc.fact_claim_id, artifact.sha256 AS evidence_sha256,
  artifact.original_uri AS evidence_url, artifact.storage_uri,
  ro.received_at AS retrieved_at
FROM intelligence.raw_observation ro
JOIN intelligence.fact_claim fc ON fc.raw_observation_id = ro.raw_observation_id
JOIN provenance.source_artifact artifact ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'abiKey' IS NOT NULL
  AND fc.status = 'PUBLISHED' AND fc.superseded_by_claim_id IS NULL
ORDER BY ro.payload_json ->> 'abiKey', ro.raw_observation_id DESC;

CREATE MATERIALIZED VIEW read_models.abi_article_snapshot AS
SELECT * FROM read_models.abi_article;
CREATE UNIQUE INDEX ux_abi_article_snapshot ON read_models.abi_article_snapshot (article_key);
CREATE INDEX ix_abi_article_day ON read_models.abi_article_snapshot ((article ->> 'publicationDay') DESC);
CREATE INDEX ix_abi_article_mentions ON read_models.abi_article_snapshot USING gin ((article -> 'mentions') jsonb_path_ops);

CREATE VIEW read_models.abi_company_mention AS
SELECT a.article_key, a.fact_claim_id,
  mention ->> 'filerCode' AS filer_code, mention ->> 'filer' AS filer,
  mention ->> 'role' AS role, mention ->> 'alias' AS alias,
  mention ->> 'evidence' AS evidence, mention ->> 'field' AS field,
  (mention ->> 'start')::integer AS start_offset, (mention ->> 'end')::integer AS end_offset
FROM read_models.abi_article_snapshot a
CROSS JOIN LATERAL jsonb_array_elements(a.article -> 'mentions') AS mention;

CREATE FUNCTION read_models.refresh_abi_news() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('abi-news-refresh'));
  REFRESH MATERIALIZED VIEW read_models.abi_article_snapshot;
END;
$$;
REVOKE ALL ON FUNCTION read_models.refresh_abi_news() FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT ON read_models.abi_article_snapshot, read_models.abi_company_mention TO %I', r);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_writer') THEN
    GRANT EXECUTE ON FUNCTION read_models.refresh_abi_news() TO backend_writer;
  END IF;
END;
$$;
`;
export const dropAbiNews = `
DROP FUNCTION IF EXISTS read_models.refresh_abi_news();
DROP VIEW IF EXISTS read_models.abi_company_mention;
DROP MATERIALIZED VIEW IF EXISTS read_models.abi_article_snapshot;
DROP VIEW IF EXISTS read_models.abi_article;
DROP INDEX IF EXISTS intelligence.ix_raw_observation_abi_key;
`;
