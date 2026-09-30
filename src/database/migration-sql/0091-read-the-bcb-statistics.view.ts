/**
 * The central bank's statistics, opened for reading.
 *
 * The `bcb-statistics` seeder files every series twice: a small catalogue observation
 * (name, unit, frequency, first and last period, number of points) and a large one with
 * the points. Two views keep them apart on purpose. The catalogue is twelve thousand rows
 * of about a kilobyte and is read whole to draw the picker; the points are read one series
 * at a time, filtered by code, so that opening a chart unpacks one payload and not all.
 *
 * A workbook the bank republishes arrives with the same series and one more point, under
 * a new payload hash. Both views keep the observation received last for each code, so the
 * figure on screen follows the bank while the earlier ones stay as evidence.
 */

export const dropBcbStatisticViews = `
DROP VIEW IF EXISTS read_models.bcb_statistic_catalog;
DROP VIEW IF EXISTS read_models.bcb_statistic_data;
`;

export const bcbStatisticCatalogView = `
CREATE VIEW read_models.bcb_statistic_catalog AS
SELECT DISTINCT ON (ro.payload_json ->> 'indicatorCode')
  ro.payload_json ->> 'indicatorCode'            AS indicator_code,
  ro.payload_json ->> 'name'                     AS name,
  ro.payload_json ->> 'family'                   AS family,
  ro.payload_json ->> 'workbook'                 AS workbook,
  ro.payload_json ->> 'sheet'                    AS sheet,
  ro.payload_json ->> 'unit'                     AS unit,
  ro.payload_json ->> 'frequency'                AS frequency,
  ro.payload_json -> 'locator'                   AS locator,
  (ro.payload_json ->> 'firstPeriod')::date      AS first_period,
  (ro.payload_json ->> 'lastPeriod')::date       AS last_period,
  (ro.payload_json ->> 'pointCount')::integer    AS point_count,
  ro.received_at,
  artifact.original_uri                          AS source_url,
  artifact.sha256                                AS evidence_sha256
FROM intelligence.raw_observation ro
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'dataCategory' = 'BCB_STATISTIC_CATALOG'
ORDER BY
  ro.payload_json ->> 'indicatorCode',
  ro.received_at DESC,
  ro.raw_observation_id DESC;
`;

export const bcbStatisticDataView = `
CREATE VIEW read_models.bcb_statistic_data AS
SELECT DISTINCT ON (ro.payload_json ->> 'indicatorCode')
  ro.payload_json ->> 'indicatorCode' AS indicator_code,
  ro.payload_json -> 'points'         AS points,
  ro.received_at,
  artifact.original_uri               AS source_url,
  artifact.sha256                     AS evidence_sha256
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'dataCategory' = 'BCB_STATISTIC_DATA'
  AND fc.status = 'PUBLISHED'
  AND fc.superseded_by_claim_id IS NULL
ORDER BY
  ro.payload_json ->> 'indicatorCode',
  ro.received_at DESC,
  ro.raw_observation_id DESC;
`;

export const bcbStatisticIndexes = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_bcb_catalog
  ON intelligence.raw_observation ((payload_json ->> 'indicatorCode'))
  WHERE payload_json ->> 'dataCategory' = 'BCB_STATISTIC_CATALOG';
CREATE INDEX IF NOT EXISTS ix_raw_observation_bcb_data
  ON intelligence.raw_observation ((payload_json ->> 'indicatorCode'))
  WHERE payload_json ->> 'dataCategory' = 'BCB_STATISTIC_DATA';
`;

export const grants = `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY['bcb_statistic_catalog', 'bcb_statistic_data'] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;
