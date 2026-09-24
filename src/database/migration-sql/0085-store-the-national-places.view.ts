/**
 * The national place models exactly as migration 0085 rewrote them.
 *
 * A snapshot, never edited: a later change is a later migration with its own
 * copy. Migration 0084 holds the previous text.
 */

/**
 * Drops whatever `national_place` is right now, view or stored copy.
 *
 * `DROP VIEW IF EXISTS` on a materialised view is not a no-op, it is an error
 * («is not a view»), and the same goes the other way round. The migration must
 * be re-runnable after a half-finished attempt — a failed migration holds the
 * API down — so the kind is asked of the catalog before choosing the statement.
 */
export const dropNationalPlaceModels = `
DROP VIEW IF EXISTS read_models.national_place_family;
DO $$
DECLARE
  kind "char";
BEGIN
  SELECT c.relkind INTO kind
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'read_models' AND c.relname = 'national_place';
  IF kind = 'v' THEN
    EXECUTE 'DROP VIEW read_models.national_place';
  ELSIF kind = 'm' THEN
    EXECUTE 'DROP MATERIALIZED VIEW read_models.national_place';
  END IF;
END;
$$;
`;

/**
 * One row per place in the country, stored instead of recomputed.
 *
 * The columns and their meaning are those of 0084, in the same order, so every
 * reader of `national_place` keeps working without knowing it changed kind.
 * What changed is when the work is done. 0084 joined each place to the newest
 * of its municipality assignments with a `DISTINCT ON` over the observation
 * table, and the report's filter on `locality` — a `COALESCE` of the declared
 * town and the assigned one — could not use any index. Measured on 2026-09-24
 * against test: `/api/familias` 31 s and a 503; Santa Cruz without a family
 * past the 30 s ceiling and a 500; Santa Cruz with a family 12 to 14 s. Before
 * 0084 the same reads took 3 to 7 s. Now the join is paid once per load.
 *
 * One more thing changes, and it is a fix: La Paz was two cities. The polygon
 * layer calls the municipality «La Paz» and so does the three-city corpus, but
 * the Overture refresh and part of the national delivery declare the official
 * name, «Nuestra Señora de La Paz» — 6.118 rows in the seeds on 2026-09-24 —
 * and the report listed the two side by side, each with half the city. The
 * seeds are left as delivered: `declared_locality` still says what the source
 * said, and only `locality`, the town the reader chooses by, is unified.
 */
export const nationalPlaceSnapshot = `
CREATE MATERIALIZED VIEW read_models.national_place AS
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
  CASE
    WHEN COALESCE(ro.payload_json ->> 'locality', assigned.municipality)
         IN ('Nuestra Señora de La Paz', 'Nuestra Senora de La Paz') THEN 'La Paz'
    ELSE COALESCE(ro.payload_json ->> 'locality', assigned.municipality)
  END                                                    AS locality,
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
WHERE ro.payload_json ->> 'dataCategory' = 'NATIONAL_POI'
WITH NO DATA;
`;

/**
 * The keys the readers filter by.
 *
 * `fact_claim_id` is unique by construction — one row per claim, and the two
 * left joins are one-to-one — and a unique index is what lets the copy be
 * refreshed `CONCURRENTLY`, without locking the report out while it rebuilds.
 *
 * The last one looks odd and is deliberate. The dashboard reads this model
 * inside a union with the three-city corpus and names the places without a town
 * «Sin localidad declarada» (`src/lib/places.ts`, `PLACE_UNION`), so the
 * condition that reaches this copy is on that `COALESCE`, not on `locality`.
 * An index on the same expression is the only one that serves it.
 */
export const nationalPlaceIndexes = `
CREATE UNIQUE INDEX IF NOT EXISTS ux_national_place_claim
  ON read_models.national_place (fact_claim_id);
CREATE INDEX IF NOT EXISTS ix_national_place_place
  ON read_models.national_place (place_id);
CREATE INDEX IF NOT EXISTS ix_national_place_locality_family
  ON read_models.national_place (locality, entity_family)
  WHERE status = 'PUBLISHED' AND NOT superseded;
CREATE INDEX IF NOT EXISTS ix_national_place_report_locality_family
  ON read_models.national_place ((COALESCE(locality, 'Sin localidad declarada')), entity_family)
  WHERE status = 'PUBLISHED' AND NOT superseded;
CREATE INDEX IF NOT EXISTS ix_national_place_family
  ON read_models.national_place (entity_family)
  WHERE status = 'PUBLISHED' AND NOT superseded;
`;

/** As migration 0084 wrote it, now over the stored copy. */
export const nationalPlaceFamilyView = `
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

export const nationalPlaceGrants = `
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
