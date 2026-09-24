/**
 * The national place models exactly as migration 0084 rewrote them.
 *
 * A snapshot, never edited: a later change is a later migration with its own
 * copy. Migration 0074 holds the previous text.
 */

export const dropLocatedPlaceViews = `
DROP VIEW IF EXISTS read_models.national_place_family;
DROP VIEW IF EXISTS read_models.national_place;
`;

/**
 * One row per place in the country, now with a municipality where the source
 * named none.
 *
 * `locality` keeps its meaning for every reader that already uses it — the town
 * a place is in — and is now filled for the places whose source was silent,
 * from the municipal polygon their coordinates fall in. On 2026-09-24 that was
 * 48.854 places, 7.821 of them in Santa Cruz de la Sierra, which the report had
 * been filing under «Sin localidad declarada».
 *
 * The two kinds are never blurred: `declared_locality` is what the source said,
 * `locality_method` is `DECLARADA` or the assignment's own method, and
 * `municipality_code` is the INE code whenever the town came from a polygon.
 * A declared town always wins. Where a source named a town and the polygon
 * disagrees — 2,5 % of the declared rows, mostly the neighbour across a
 * conurbation — the source is what the reader sees.
 *
 * `outside_country` is true for the places a bounding-box load carried in from
 * the neighbours: they stay in the corpus, and the report leaves them off.
 *
 * `DISTINCT ON` keeps the newest assignment of each place, so a rebuilt layer
 * corrects by reloading and never by rewriting.
 */
export const locatedPlaceView = `
CREATE VIEW read_models.national_place AS
WITH assigned AS (
  SELECT DISTINCT ON (ro.payload_json ->> 'placeId')
    ro.payload_json ->> 'placeId'          AS place_id,
    ro.payload_json ->> 'method'           AS method,
    ro.payload_json ->> 'municipality'     AS municipality,
    ro.payload_json ->> 'municipalityCode' AS municipality_code,
    ro.payload_json ->> 'department'       AS department
  FROM intelligence.raw_observation ro
  JOIN intelligence.fact_claim fc
    ON fc.raw_observation_id = ro.raw_observation_id
  WHERE ro.payload_json ->> 'dataCategory' = 'PLACE_MUNICIPALITY'
    AND fc.status = 'PUBLISHED'
    AND fc.superseded_by_claim_id IS NULL
  ORDER BY ro.payload_json ->> 'placeId', ro.received_at DESC, ro.raw_observation_id DESC
)
SELECT
  fc.fact_claim_id,
  ro.payload_json ->> 'placeId'                          AS place_id,
  ro.payload_json ->> 'publisher'                        AS publisher,
  ro.payload_json ->> 'name'                             AS name,
  COALESCE(ro.payload_json ->> 'locality', assigned.municipality) AS locality,
  COALESCE(ro.payload_json ->> 'department', assigned.department) AS department,
  (ro.payload_json ->> 'latitude')::numeric              AS latitude,
  (ro.payload_json ->> 'longitude')::numeric             AS longitude,
  ro.payload_json ->> 'entityGroup'                      AS entity_group,
  ro.payload_json ->> 'entityFamily'                     AS entity_family,
  ro.payload_json ->> 'commercialRole'                   AS commercial_role,
  (ro.payload_json ->> 'isRegulated')::boolean           AS is_regulated,
  (ro.payload_json ->> 'genericFamily')::boolean         AS generic_family,
  ro.payload_json ->> 'basicCategory'                    AS basic_category,
  (ro.payload_json ->> 'confidence')::numeric            AS confidence,
  ro.payload_json ->> 'positionMethod'                   AS position_method,
  ro.payload_json ->> 'dataLevel'                        AS data_level,
  ro.payload_json ->> 'address'                          AS address,
  ro.payload_json ->> 'openingHours'                     AS opening_hours,
  ro.payload_json ->> 'officialValidationSource'         AS official_validation_source,
  ro.payload_json ->> 'validationPriority'               AS validation_priority,
  ro.payload_json #>> '{resemblesHeldPlace,placeId}'     AS resembles_held_place_id,
  (ro.payload_json #>> '{resemblesHeldPlace,metres}')::numeric AS resembles_metres,
  (ro.payload_json ->> 'snapshotTakenAt')::timestamptz   AS snapshot_taken_at,
  ro.payload_json ->> 'licence'                          AS licence,
  artifact.sha256                                        AS evidence_sha256,
  fc.status,
  (fc.superseded_by_claim_id IS NOT NULL)                AS superseded,
  ro.payload_json ->> 'locality'                         AS declared_locality,
  CASE
    WHEN ro.payload_json ->> 'locality' IS NOT NULL THEN 'DECLARADA'
    ELSE assigned.method
  END                                                    AS locality_method,
  CASE
    WHEN ro.payload_json ->> 'locality' IS NULL THEN assigned.municipality_code
  END                                                    AS municipality_code,
  COALESCE(assigned.method = 'FUERA_DE_BOLIVIA', false)  AS outside_country
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
LEFT JOIN assigned
  ON assigned.place_id = ro.payload_json ->> 'placeId'
WHERE ro.payload_json ->> 'dataCategory' = 'NATIONAL_POI';
`;

/** As migration 0074 wrote it, plus how many places a polygon located. */
export const locatedPlaceFamilyView = `
CREATE VIEW read_models.national_place_family AS
SELECT
  entity_group,
  entity_family,
  count(*)                                                            AS places,
  count(*) FILTER (WHERE is_regulated)                                AS regulated,
  count(*) FILTER (WHERE NOT generic_family)                          AS refined,
  count(*) FILTER (WHERE locality IS NOT NULL)                        AS with_locality,
  count(*) FILTER (WHERE department IS NOT NULL)                      AS with_department,
  count(*) FILTER (WHERE resembles_held_place_id IS NOT NULL)         AS resembling,
  count(*) FILTER (WHERE publisher = 'Overture Maps Foundation')      AS from_overture,
  count(*) FILTER (WHERE publisher = 'OpenStreetMap contributors')    AS from_openstreetmap,
  round(avg(confidence), 4)                                           AS mean_confidence,
  count(*) FILTER (WHERE locality_method IN ('MUNICIPIO', 'MUNICIPIO_CERCANO')) AS located_by_polygon
FROM read_models.national_place
WHERE status = 'PUBLISHED' AND NOT superseded AND NOT outside_country
GROUP BY entity_group, entity_family;
`;

/**
 * The join key. Without it, every read of the national places scans the whole
 * observation table a second time to find the assignments.
 */
export const locatedPlaceIndexes = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_place_municipality
  ON intelligence.raw_observation ((payload_json ->> 'placeId'))
  WHERE payload_json ->> 'dataCategory' = 'PLACE_MUNICIPALITY';
`;

export const locatedPlaceGrants = `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY['national_place', 'national_place_family'] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;
