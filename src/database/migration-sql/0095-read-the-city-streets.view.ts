/**
 * Opens the streets of the cities for reading: the cells of geometry and the index
 * of their names.
 *
 * The same pattern as 0083 and 0088: each view reads `intelligence.raw_observation`
 * by its own `dataCategory`, joined to the claim that carries its status and to the
 * artifact that names its licence, and keeps the latest `snapshotDate` of its
 * category alone, because the loaders only add.
 *
 * What is new is the weight. A cell holds ~8 KB of geometry and the 3.256 of them
 * ~27 MB, and a JSON path over a TOASTed value decompresses all of it. So the
 * cell is found by an expression index on its id, and the latest snapshot by an
 * expression index on `snapshotDate` that `max()` can walk without reading a
 * payload: a request for the six cells under the screen reads six payloads, not
 * three thousand.
 */

const CELL = 'ROAD_STREET_CELL';
const INDEX = 'ROAD_STREET_INDEX';

const provenanceColumns = `
  artifact.metadata_json ->> 'attribution'             AS attribution,
  artifact.metadata_json ->> 'licence'                 AS licence,
  artifact.sha256                                      AS evidence_sha256,
  fc.status                                            AS claim_status,
  (fc.superseded_by_claim_id IS NOT NULL)              AS superseded`;

/**
 * The rows of one category from its latest snapshot. The `max()` is written on the
 * bare expression the partial index is declared on, with no `COALESCE` around it,
 * so the planner can answer it from the index alone.
 */
function latestOf(category: string): string {
  return `
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'dataCategory' = '${category}'
  AND ro.payload_json ->> 'snapshotDate' = (
    SELECT max(latest.payload_json ->> 'snapshotDate')
    FROM intelligence.raw_observation latest
    WHERE latest.payload_json ->> 'dataCategory' = '${category}'
  )`;
}

export const dropCityStreetViews = `
DROP VIEW IF EXISTS read_models.road_street_index;
DROP VIEW IF EXISTS read_models.road_street_cell;
`;

/** One row per cell: the streets it holds, with their geometry. */
export const roadStreetCellView = `
CREATE VIEW read_models.road_street_cell AS
SELECT
  fc.fact_claim_id,
  ro.payload_json ->> 'cellId'                         AS cell_id,
  ro.payload_json ->> 'department'                     AS department,
  ro.payload_json -> 'bounds'                          AS bounds,
  (ro.payload_json ->> 'streetCount')::integer         AS street_count,
  ro.payload_json -> 'streets'                         AS streets,
  ro.payload_json ->> 'snapshotDate'                   AS snapshot_date,
${provenanceColumns}
${latestOf(CELL)};
`;

/** One row per city: every street name OpenStreetMap gives it, with length and box. */
export const roadStreetIndexView = `
CREATE VIEW read_models.road_street_index AS
SELECT
  fc.fact_claim_id,
  ro.payload_json ->> 'city'                           AS city,
  (ro.payload_json ->> 'streetCount')::integer         AS street_count,
  ro.payload_json -> 'streets'                         AS streets,
  ro.payload_json ->> 'snapshotDate'                   AS snapshot_date,
${provenanceColumns}
${latestOf(INDEX)};
`;

export const cityStreetIndexes = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_street_cell_snapshot
  ON intelligence.raw_observation ((payload_json ->> 'snapshotDate'))
  WHERE payload_json ->> 'dataCategory' = '${CELL}';
CREATE INDEX IF NOT EXISTS ix_raw_observation_street_cell_id
  ON intelligence.raw_observation ((payload_json ->> 'cellId'))
  WHERE payload_json ->> 'dataCategory' = '${CELL}';
CREATE INDEX IF NOT EXISTS ix_raw_observation_street_index_snapshot
  ON intelligence.raw_observation ((payload_json ->> 'snapshotDate'))
  WHERE payload_json ->> 'dataCategory' = '${INDEX}';
`;

export const dropCityStreetIndexes = `
DROP INDEX IF EXISTS intelligence.ix_raw_observation_street_index_snapshot;
DROP INDEX IF EXISTS intelligence.ix_raw_observation_street_cell_id;
DROP INDEX IF EXISTS intelligence.ix_raw_observation_street_cell_snapshot;
`;

export const grants = `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY['road_street_cell', 'road_street_index'] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;
