/**
 * Opens the rail and river networks for reading, and shows one road network
 * instead of two.
 *
 * The same pattern as 0083: each view reads `intelligence.raw_observation` by
 * its own `dataCategory`, joined to the claim that carries its status and to
 * the artifact that names its licence. What is new is the snapshot rule. The
 * loaders only add, so the 2026-09-26 extract lands beside the 2026-09-22 one;
 * a view that read every row would draw each road twice and sum both into one
 * total. Every geometry view keeps the latest `snapshotDate` of its category
 * alone — the rows of 0083's first load carry none, and read as the
 * 2026-09-22 extract they came from.
 */

const ROAD_FIRST_SNAPSHOT = '2026-09-22';

export const dropTransportViews = `
DROP VIEW IF EXISTS read_models.water_port;
DROP VIEW IF EXISTS read_models.waterway_line;
DROP VIEW IF EXISTS read_models.rail_flow;
DROP VIEW IF EXISTS read_models.rail_station;
DROP VIEW IF EXISTS read_models.rail_line;
`;

/** The provenance every row carries, the same four columns 0083 exposes. */
const provenanceColumns = `
  artifact.metadata_json ->> 'attribution'             AS attribution,
  artifact.metadata_json ->> 'licence'                 AS licence,
  artifact.sha256                                      AS evidence_sha256,
  fc.status                                            AS claim_status,
  (fc.superseded_by_claim_id IS NOT NULL)              AS superseded`;

/** The rows of one category, from the latest snapshot that category holds. */
function latestOf(category: string, fallback = 'NULL'): string {
  const snapshot = `COALESCE(ro.payload_json ->> 'snapshotDate', ${fallback})`;
  return `
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'dataCategory' = '${category}'
  AND ${snapshot} = (
    SELECT max(COALESCE(latest.payload_json ->> 'snapshotDate', ${fallback}))
    FROM intelligence.raw_observation latest
    WHERE latest.payload_json ->> 'dataCategory' = '${category}'
  )`;
}

/**
 * 0083's view, the same columns, plus the snapshot it comes from and the rule.
 * `CREATE OR REPLACE` and the new column last, so the grants the tablero reads
 * with survive the change.
 */
export const roadSectionView = `
CREATE OR REPLACE VIEW read_models.road_section AS
SELECT
  fc.fact_claim_id,
  ro.payload_json ->> 'sectionId'                    AS section_id,
  ro.payload_json ->> 'route'                         AS route,
  ro.payload_json ->> 'network'                       AS network,
  ro.payload_json ->> 'name'                          AS name,
  ro.payload_json ->> 'department'                    AS department,
  ro.payload_json ->> 'highwayClass'                  AS highway_class,
  ro.payload_json ->> 'surface'                       AS surface,
  ro.payload_json ->> 'status'                        AS status,
  (ro.payload_json ->> 'lengthKm')::numeric            AS length_km,
  (ro.payload_json ->> 'carriagewayKm')::numeric       AS carriageway_km,
  ro.payload_json ->> 'maxspeed'                      AS maxspeed,
  (ro.payload_json ->> 'wayCount')::integer            AS way_count,
  ro.payload_json -> 'geometry'                       AS geometry,${provenanceColumns},
  COALESCE(ro.payload_json ->> 'snapshotDate', '${ROAD_FIRST_SNAPSHOT}') AS snapshot_date
${latestOf('ROAD_SECTION', `'${ROAD_FIRST_SNAPSHOT}'`)};
`;

/** 0083's view as it was, for `down`. */
export const roadSectionViewBefore = `
DROP VIEW IF EXISTS read_models.road_section;
CREATE VIEW read_models.road_section AS
SELECT
  fc.fact_claim_id,
  ro.payload_json ->> 'sectionId'                    AS section_id,
  ro.payload_json ->> 'route'                         AS route,
  ro.payload_json ->> 'network'                       AS network,
  ro.payload_json ->> 'name'                          AS name,
  ro.payload_json ->> 'department'                    AS department,
  ro.payload_json ->> 'highwayClass'                  AS highway_class,
  ro.payload_json ->> 'surface'                       AS surface,
  ro.payload_json ->> 'status'                        AS status,
  (ro.payload_json ->> 'lengthKm')::numeric            AS length_km,
  (ro.payload_json ->> 'carriagewayKm')::numeric       AS carriageway_km,
  ro.payload_json ->> 'maxspeed'                      AS maxspeed,
  (ro.payload_json ->> 'wayCount')::integer            AS way_count,
  ro.payload_json -> 'geometry'                       AS geometry,${provenanceColumns}
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'dataCategory' = 'ROAD_SECTION';
`;

/**
 * One row per rail line, department and state: `ANDINA`, `ORIENTAL` or
 * `METROPOLITANA`; in service, under construction, disused or abandoned.
 */
export const railLineView = `
CREATE VIEW read_models.rail_line AS
SELECT
  fc.fact_claim_id,
  ro.payload_json ->> 'lineId'                        AS line_id,
  ro.payload_json ->> 'network'                       AS network,
  ro.payload_json ->> 'line'                          AS line,
  ro.payload_json ->> 'department'                    AS department,
  ro.payload_json ->> 'status'                        AS status,
  ro.payload_json ->> 'operator'                      AS operator,
  ro.payload_json ->> 'gauge'                         AS gauge,
  ro.payload_json ->> 'usage'                         AS usage,
  (ro.payload_json ->> 'lengthKm')::numeric            AS length_km,
  ro.payload_json -> 'geometry'                       AS geometry,
  ro.payload_json ->> 'snapshotDate'                  AS snapshot_date,${provenanceColumns}
${latestOf('RAIL_LINE')};
`;

export const railStationView = `
CREATE VIEW read_models.rail_station AS
SELECT
  fc.fact_claim_id,
  ro.payload_json ->> 'osmId'                         AS osm_id,
  ro.payload_json ->> 'name'                          AS name,
  ro.payload_json ->> 'kind'                          AS kind,
  ro.payload_json ->> 'network'                       AS network,
  ro.payload_json ->> 'department'                    AS department,
  (ro.payload_json ->> 'lon')::numeric                 AS lon,
  (ro.payload_json ->> 'lat')::numeric                 AS lat,
  ro.payload_json ->> 'snapshotDate'                  AS snapshot_date,${provenanceColumns}
${latestOf('RAIL_STATION')};
`;

/**
 * The INE's traffic, one row per network, service and period (`AAAA` or
 * `AAAA-MM`), the latest retrieval of each: a revised figure comes back as a
 * new reading and replaces the old one here without deleting it.
 */
export const railFlowView = `
CREATE VIEW read_models.rail_flow AS
SELECT DISTINCT ON (network, service, period)
  fc.fact_claim_id,
  ro.payload_json ->> 'network'                       AS network,
  ro.payload_json ->> 'service'                       AS service,
  ro.payload_json ->> 'unit'                          AS unit,
  ro.payload_json ->> 'period'                        AS period,
  (ro.payload_json ->> 'value')::numeric               AS value,
  (ro.payload_json ->> 'preliminary')::boolean         AS preliminary,
  (ro.payload_json ->> 'partialYear')::boolean         AS partial_year,
  artifact.sha256                                      AS evidence_sha256,
  fc.status                                            AS claim_status,
  (fc.superseded_by_claim_id IS NOT NULL)              AS superseded
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'dataCategory' = 'RAIL_FLOW'
ORDER BY network, service, period, ro.payload_json ->> 'retrievedAt' DESC, ro.received_at DESC;
`;

/** One row per river (or ferry crossing), navigability category and department. */
export const waterwayLineView = `
CREATE VIEW read_models.waterway_line AS
SELECT
  fc.fact_claim_id,
  ro.payload_json ->> 'waterwayId'                    AS waterway_id,
  ro.payload_json ->> 'category'                      AS category,
  ro.payload_json ->> 'name'                          AS name,
  ro.payload_json ->> 'department'                    AS department,
  (ro.payload_json ->> 'lengthKm')::numeric            AS length_km,
  (ro.payload_json ->> 'boatYesKm')::numeric           AS boat_yes_km,
  ro.payload_json -> 'geometry'                       AS geometry,
  ro.payload_json ->> 'snapshotDate'                  AS snapshot_date,${provenanceColumns}
${latestOf('WATERWAY_LINE')};
`;

export const waterPortView = `
CREATE VIEW read_models.water_port AS
SELECT
  fc.fact_claim_id,
  ro.payload_json ->> 'osmId'                         AS osm_id,
  ro.payload_json ->> 'name'                          AS name,
  ro.payload_json ->> 'kind'                          AS kind,
  ro.payload_json ->> 'department'                    AS department,
  (ro.payload_json ->> 'lon')::numeric                 AS lon,
  (ro.payload_json ->> 'lat')::numeric                 AS lat,
  ro.payload_json ->> 'snapshotDate'                  AS snapshot_date,${provenanceColumns}
${latestOf('WATER_PORT')};
`;

const CATEGORIES = ['RAIL_LINE', 'RAIL_STATION', 'RAIL_FLOW', 'WATERWAY_LINE', 'WATER_PORT'];

export const transportIndexes = CATEGORIES.map(
  (category) => `
CREATE INDEX IF NOT EXISTS ix_raw_observation_${category.toLowerCase()}
  ON intelligence.raw_observation ((payload_json ->> 'dataCategory'))
  WHERE payload_json ->> 'dataCategory' = '${category}';`,
).join('\n');

export const dropTransportIndexes = CATEGORIES.map(
  (category) => `DROP INDEX IF EXISTS intelligence.ix_raw_observation_${category.toLowerCase()};`,
).join('\n');

/** Read access for the tablero's role and the backup's, on the views named. */
export function grantsOn(views: readonly string[]): string {
  return `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY[${views.map((view) => `'${view}'`).join(', ')}] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;
}

export const TRANSPORT_VIEWS = [
  'rail_line',
  'rail_station',
  'rail_flow',
  'waterway_line',
  'water_port',
] as const;
