/**
 * The commerce register exactly as migration 0069 narrowed it.
 *
 * A snapshot, never edited, for the same reason as every file beside it: a
 * later change to how a reading is filed is a later migration carrying its own
 * copy, so rolling forward and back always replays what that step applied.
 *
 * Two things changed against the 0062 definition it replaces. The register now
 * admits only COMMERCE, because ADR 0025 retired the platform analytics that
 * shared it; and `emotional_register` is gone with them, because it existed to
 * file monitored reactions and derives nothing from a household panel.
 */

export const dropCommerceRegister = `
DROP MATERIALIZED VIEW IF EXISTS read_models.social_reading_snapshot;
DROP VIEW IF EXISTS read_models.informal_trade_gap;
DROP VIEW IF EXISTS read_models.informal_trade_coverage;
DROP VIEW IF EXISTS read_models.informal_trade_channel_mix;
DROP VIEW IF EXISTS read_models.social_commerce;
DROP VIEW IF EXISTS read_models.social_platform_audience;
DROP VIEW IF EXISTS read_models.social_reading;
`;

/**
 * Every commerce reading a third party published, and nothing else.
 *
 * The subject filter is what retires the analytics. The readings themselves
 * stay in `intelligence.raw_observation` untouched — raw data and audit are
 * immutable here, and a correction narrows what is served rather than deleting
 * what was received.
 */
export const commerceRegisterView = `
CREATE VIEW read_models.social_reading AS
WITH published AS (
  SELECT
    fc.fact_claim_id,
    ro.raw_observation_id,
    fc.event_date,
    fc.published_at,
    ro.received_at,
    ro.payload_json ->> 'platform'             AS platform,
    ro.payload_json ->> 'subject'              AS subject,
    ro.payload_json ->> 'metric'               AS metric,
    ro.payload_json ->> 'label'                AS label,
    (ro.payload_json ->> 'value')::numeric     AS value,
    ro.payload_json ->> 'unit'                 AS unit,
    ro.payload_json ->> 'referencePeriod'      AS reference_period,
    ro.payload_json ->> 'publisher'            AS publisher,
    ro.payload_json ->> 'domain'               AS publisher_domain,
    ro.payload_json ->> 'publication'          AS publication,
    ro.payload_json ->> 'publicationPrecision' AS publication_precision,
    ro.payload_json ->> 'method'               AS method,
    ro.payload_json ->> 'evidenceGrade'        AS evidence_grade,
    ro.payload_json ->> 'url'                  AS reading_url,
    artifact.sha256                            AS record_sha256,
    fc.confidence_level,
    fc.status,
    (fc.superseded_by_claim_id IS NOT NULL) AS superseded,
    fc.assertion,
    evidence.excerpt AS statement
  FROM intelligence.fact_claim fc
  JOIN intelligence.raw_observation ro
    ON ro.raw_observation_id = fc.raw_observation_id
  LEFT JOIN provenance.source_artifact artifact
    ON artifact.source_artifact_id = ro.source_artifact_id
  LEFT JOIN LATERAL (
    SELECT ce.excerpt
    FROM intelligence.claim_evidence ce
    WHERE ce.fact_claim_id = fc.fact_claim_id
    ORDER BY ce.claim_evidence_id
    LIMIT 1
  ) AS evidence ON true
  WHERE ro.payload_json ->> 'dataCategory' = 'SOCIAL_READING'
    AND ro.payload_json ->> 'subject' = 'COMMERCE'
    AND ro.payload_json ->> 'metric' IS NOT NULL
)
SELECT
  published.*,
  -- Which measured series a reading speaks to is often stated only in the
  -- body, so the counterpart reads the whole record rather than the label.
  -- This is the comparison that gives the register its worth: a reading is
  -- worth holding when the distance to the measured series can be taken.
  CASE
    WHEN narrated ~ ANY (ARRAY[
      '\\minflacion', '\\mprecio', '\\mcanasta', '\\mcarestia', '\\malimento'
    ]) THEN 'PRECIOS'
    WHEN narrated ~ ANY (ARRAY[
      '\\mdolar', '\\mtipo de cambio', '\\mdivisa', '\\mparalelo', '\\mdevaluac'
    ]) THEN 'CAMBIARIO'
    WHEN narrated ~ ANY (ARRAY[
      '\\mqr\\M', '\\mpago', '\\mbilletera', '\\mbancar', '\\mtransacc'
    ]) THEN 'PAGOS'
    WHEN narrated ~ ANY (ARRAY[
      '\\mcompra', '\\mventa', '\\mtienda', '\\mcomercio', '\\mhogares',
      '\\mconsumo', '\\mferia', '\\mmercado'
    ]) THEN 'CONSUMO'
    ELSE 'NINGUNO'
  END AS official_counterpart
FROM published,
  LATERAL (
    SELECT translate(
      lower(coalesce(label, '') || ' ' || coalesce(metric, '') || ' ' || coalesce(statement, '')),
      'áéíóúüñÁÉÍÓÚÜÑ',
      'aeiouunaeiouun'
    )
  ) AS narrated_terms(narrated);
`;

/** The materialised copy, rebuilt without the retired emotional index. */
export const commerceSnapshot = `
CREATE MATERIALIZED VIEW IF NOT EXISTS read_models.social_reading_snapshot AS
  SELECT * FROM read_models.social_reading;
`;

export const commerceSnapshotIndexes = `
CREATE UNIQUE INDEX IF NOT EXISTS ux_social_reading_snapshot_claim
  ON read_models.social_reading_snapshot (fact_claim_id);
CREATE INDEX IF NOT EXISTS ix_social_reading_snapshot_date
  ON read_models.social_reading_snapshot (event_date DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS ix_social_reading_snapshot_platform
  ON read_models.social_reading_snapshot (platform);
CREATE INDEX IF NOT EXISTS ix_social_reading_snapshot_subject
  ON read_models.social_reading_snapshot (subject);
CREATE INDEX IF NOT EXISTS ix_social_reading_snapshot_metric
  ON read_models.social_reading_snapshot (metric);
CREATE INDEX IF NOT EXISTS ix_social_reading_snapshot_grade
  ON read_models.social_reading_snapshot (evidence_grade);
CREATE INDEX IF NOT EXISTS ix_social_reading_snapshot_counterpart
  ON read_models.social_reading_snapshot (official_counterpart);
`;

export const commerceGrants = `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY[
        'social_reading',
        'social_reading_snapshot',
        'social_commerce',
        'informal_trade_channel_mix',
        'informal_trade_coverage',
        'informal_trade_gap'
      ] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;
