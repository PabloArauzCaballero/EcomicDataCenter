/**
 * The national place models exactly as migration 0074 rewrote them.
 *
 * A snapshot, never edited: a later change is a later migration with its own
 * copy. Migration 0073 holds the previous text, which described a corpus that
 * had no department on any row and no suspicion of duplication on any row,
 * because the only delivery it was written for carried neither.
 */

export const dropExpandedPlaceViews = `
DROP VIEW IF EXISTS read_models.national_place_family;
DROP VIEW IF EXISTS read_models.national_place;
`;

/**
 * One row per place in the country, now that two deliveries feed it.
 *
 * Three columns are new, and each of them exists because the second delivery
 * knows something the first did not.
 *
 * `department` is filled for the places the Cochabamba and La Paz expansion
 * situates and null for the national corpus, which publishes no department at
 * all. It is a membership in an OpenStreetMap administrative area, which the
 * delivery itself labels `no_limite_certificado`: an observed containment, not
 * an official boundary. A reader redrawing departmental figures from it is
 * redrawing them from OpenStreetMap's polygons, not from the state's.
 *
 * `resembles_held_place_id` names a place the observatory already holds that
 * this one is probably the same as — close enough not to be two premises and
 * named similarly enough not to be two tenants. Ninety-five of the expansion's
 * rows carry one. They are kept, not merged: merging would delete a real second
 * branch on the same block, and the three-city corpus already decided that
 * question. `resembles_metres` is how far apart the two are, so a reader can
 * set their own threshold instead of inheriting this one.
 *
 * `snapshot_taken_at` is when the source was read, and it is not when anyone
 * visited. A snapshot taken today over premises that closed last year still
 * returns the premises. Null for the national corpus, which dates by release.
 *
 * Contact details stay out of this view, as they stayed out of the last one and
 * out of `city_place`: the report that reads this is public.
 */
export const expandedPlaceView = `
CREATE VIEW read_models.national_place AS
SELECT
  fc.fact_claim_id,
  ro.payload_json ->> 'placeId'                          AS place_id,
  ro.payload_json ->> 'publisher'                        AS publisher,
  ro.payload_json ->> 'name'                             AS name,
  ro.payload_json ->> 'locality'                         AS locality,
  ro.payload_json ->> 'department'                       AS department,
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
  (fc.superseded_by_claim_id IS NOT NULL)                AS superseded
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'dataCategory' = 'NATIONAL_POI';
`;

/**
 * How many places of each family the country holds, and what is known of them.
 *
 * `resembling` joins the columns whose job is to stop a total from being read
 * as more than it is. A family whose count rests substantially on places that
 * resemble ones already stored is a family whose count is partly a second
 * sighting of the same shop, and the reader who subtracts it should be able to
 * see how much to subtract.
 */
export const expandedPlaceFamilyView = `
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
  round(avg(confidence), 4)                                           AS mean_confidence
FROM read_models.national_place
WHERE status = 'PUBLISHED' AND NOT superseded
GROUP BY entity_group, entity_family;
`;

/**
 * The column the expansion made worth filtering on.
 *
 * Migration 0073 indexed the data category and the locality. A corpus that now
 * answers «what is in this department» needs the department indexed too, or
 * every departmental question scans the whole corpus.
 */
export const expandedPlaceIndexes = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_national_department
  ON intelligence.raw_observation ((payload_json ->> 'department'))
  WHERE payload_json ->> 'dataCategory' = 'NATIONAL_POI';
`;
