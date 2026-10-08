/** Full public revision history. Consumers select their own documented as_of before ranking. */
export const exogenousFactorVersionView = `
CREATE VIEW read_models.exogenous_factor_version AS
WITH publication_authority AS (
  -- Current redistribution permission controls every vintage, independently of requested as_of.
  SELECT
    authority.payload_json ->> 'code' AS code,
    authority.payload_json ->> 'licenseStatus' AS license_status,
    ROW_NUMBER() OVER (
      PARTITION BY authority.payload_json ->> 'code'
      ORDER BY authority.received_at DESC, authority.raw_observation_id DESC
    ) AS authority_order
  FROM intelligence.raw_observation authority
  WHERE authority.payload_json ->> 'dataCategory' = 'EXOGENOUS_FACTOR'
)
SELECT
  ro.payload_json ->> 'code' AS code,
  ro.payload_json ->> 'period' AS period,
  (ro.payload_json ->> 'value')::numeric AS value,
  COALESCE((ro.payload_json ->> 'publishedAt')::timestamptz,
           (ro.payload_json ->> 'firstSeenAt')::timestamptz) AS available_at,
  ro.received_at,
  ro.payload_json || jsonb_build_object('retrievedAt', ro.received_at) AS payload,
  ro.payload_hash::text AS revision_id,
  ro.raw_observation_id,
  ro.payload_json ->> 'sourceUrl' AS source_url,
  ro.payload_json ->> 'upstreamSha256' AS evidence_sha256
FROM intelligence.raw_observation ro
JOIN publication_authority current_authority
  ON current_authority.code = ro.payload_json ->> 'code'
  AND current_authority.authority_order = 1
  AND current_authority.license_status = 'PUBLIC_REUSE_ALLOWED'
WHERE ro.payload_json ->> 'dataCategory' = 'EXOGENOUS_FACTOR'
  AND ro.payload_json ->> 'licenseStatus' = 'PUBLIC_REUSE_ALLOWED'
  AND EXISTS (
    SELECT 1 FROM intelligence.fact_claim fc
    WHERE fc.raw_observation_id = ro.raw_observation_id AND fc.status = 'PUBLISHED'
  );
`;

/** Legacy seeds do not prove historical publication dates; receipt is the conservative bound. */
export const exogenousLegacyVersionView = `
CREATE VIEW read_models.exogenous_legacy_version AS
SELECT
  ro.payload_json ->> 'indicatorCode' AS code,
  ro.payload_json ->> 'period' AS period,
  (ro.payload_json ->> 'value')::numeric AS value,
  ro.received_at AS available_at,
  ro.received_at,
  ro.payload_json AS payload,
  ro.payload_hash::text AS revision_id,
  ro.raw_observation_id,
  artifact.original_uri AS source_url,
  artifact.sha256 AS evidence_sha256
FROM intelligence.raw_observation ro
LEFT JOIN provenance.source_artifact artifact ON artifact.source_artifact_id = ro.source_artifact_id
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN ro.payload_json ->> 'period' ~ '^[1-9][0-9]{3}$'
      THEN (ro.payload_json ->> 'period') || '-01-01'
    WHEN ro.payload_json ->> 'period' ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$'
      THEN (ro.payload_json ->> 'period') || '-01'
    WHEN ro.payload_json ->> 'period' ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
      THEN ro.payload_json ->> 'period'
    ELSE NULL
  END AS period_start_text
) calendar
WHERE ro.payload_json ->> 'dataCategory' = 'EXOGENOUS_PRICE'
  -- Old seeds predate strict calendar checks. Reject impossible dates and future realizations.
  AND CASE WHEN calendar.period_start_text IS NULL THEN FALSE ELSE
    substring(calendar.period_start_text, 9, 2)::integer <= EXTRACT(DAY FROM (
      make_date(substring(calendar.period_start_text, 1, 4)::integer,
                substring(calendar.period_start_text, 6, 2)::integer, 1)
      + INTERVAL '1 month' - INTERVAL '1 day'
    ))
  END
  AND calendar.period_start_text <= to_char(ro.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  AND EXISTS (
    SELECT 1 FROM intelligence.fact_claim fc
    WHERE fc.raw_observation_id = ro.raw_observation_id AND fc.status = 'PUBLISHED'
  );
`;

export const exogenousFactorVersionIndex = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_exogenous_factor_version
  ON intelligence.raw_observation ((payload_json ->> 'code'), (payload_json ->> 'period'), received_at DESC)
  WHERE payload_json ->> 'dataCategory' = 'EXOGENOUS_FACTOR';
`;

export const exogenousVersionGrants = `
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.exogenous_factor_version, read_models.exogenous_legacy_version TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;

export const dropExogenousVersionViews = `
DROP VIEW IF EXISTS read_models.exogenous_factor_version;
DROP VIEW IF EXISTS read_models.exogenous_legacy_version;
`;
