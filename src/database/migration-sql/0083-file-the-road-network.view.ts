/**
 * Opens the road network for reading: sections traced from OpenStreetMap and
 * the INE's official length by network and rodadura.
 *
 * Two views, on the pattern migration 0073 set for the national places: a
 * corpus of geometry and provenance, read from `intelligence.raw_observation`
 * by its own `dataCategory`, joined to the fact claim that carries its status
 * and to the artifact that names its licence. Neither view touches
 * `read_models.macro_indicator_annual` — a road section is not a measured
 * magnitude in the sense a GDP figure is, and an annual length is filed here
 * rather than folded into that view's growing list of prefixes, because a
 * road is answered by a map before it is answered by a number.
 *
 * `road_section.geometry` travels as the JSON array the seed wrote —
 * `[[lon, lat], …]` per polyline, already simplified to ~200 m — because the
 * tablero draws it with its own projection and a second one in SQL would only
 * disagree with the first.
 */

export const dropRoadNetworkViews = `
DROP VIEW IF EXISTS read_models.road_length_annual;
DROP VIEW IF EXISTS read_models.road_section;
`;

/**
 * One row per tramo: the piece of a route that shares department, rodadura
 * and estado, exactly as `scripts/roads/build_road_network_seed.py` grouped
 * it. `route` is `F-<n>` for the Red Fundamental, `D<n>` for a departmental
 * route named on the ground, and null for a mapped way that carries neither —
 * which OpenStreetMap's own coverage of the departmental network leaves
 * common, and the tablero reads as «sin referencia» rather than as a gap.
 */
export const roadSectionView = `
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
  ro.payload_json -> 'geometry'                       AS geometry,
  artifact.metadata_json ->> 'attribution'             AS attribution,
  artifact.metadata_json ->> 'licence'                 AS licence,
  artifact.sha256                                      AS evidence_sha256,
  fc.status                                             AS claim_status,
  (fc.superseded_by_claim_id IS NOT NULL)              AS superseded
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'dataCategory' = 'ROAD_SECTION';
`;

/**
 * One row per geography, network, rodadura and year the INE published, 2000
 * to 2024. `preliminary` carries the `(p)` the three tables print on the last
 * three years, and it is on the row rather than dropped: a chart that plots
 * 2024 beside 2010 without it reads a figure that can still move as if it
 * were closed.
 */
export const roadLengthAnnualView = `
CREATE VIEW read_models.road_length_annual AS
SELECT
  fc.fact_claim_id,
  ro.payload_json ->> 'geography'                     AS geography,
  ro.payload_json ->> 'network'                        AS network,
  ro.payload_json ->> 'surface'                        AS surface,
  ro.payload_json ->> 'period'                         AS period,
  (ro.payload_json ->> 'lengthKm')::numeric             AS length_km,
  (ro.payload_json ->> 'preliminary')::boolean          AS preliminary,
  artifact.sha256                                       AS evidence_sha256,
  fc.status                                              AS claim_status,
  (fc.superseded_by_claim_id IS NOT NULL)               AS superseded
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'dataCategory' = 'ROAD_LENGTH';
`;

export const roadNetworkIndexes = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_road_section
  ON intelligence.raw_observation ((payload_json ->> 'dataCategory'))
  WHERE payload_json ->> 'dataCategory' = 'ROAD_SECTION';
CREATE INDEX IF NOT EXISTS ix_raw_observation_road_length
  ON intelligence.raw_observation ((payload_json ->> 'dataCategory'))
  WHERE payload_json ->> 'dataCategory' = 'ROAD_LENGTH';
`;

export const grants = `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY['road_section', 'road_length_annual'] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;
