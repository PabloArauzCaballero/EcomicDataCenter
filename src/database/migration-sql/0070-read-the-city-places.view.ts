/**
 * The place models exactly as migration 0070 wrote them.
 *
 * A snapshot, never edited: a later change to how the places are read is a
 * later migration with its own copy.
 */

export const dropPlaceViews = `
DROP VIEW IF EXISTS read_models.city_place_family;
DROP VIEW IF EXISTS read_models.city_place;
`;

/**
 * One row per place in the three cities the observatory reads.
 *
 * Kept apart from every other read model because a place is not a reading:
 * nothing here is measured, nothing is a series, and the row has no period. A
 * consumer of `economic_indicator_reading` filtering by date would find these
 * rows meaningless, and they would find them, which is reason enough for a
 * model of their own.
 *
 * The contact details a place carries upstream — telephone, e-mail — are held
 * in the raw observation, where provenance lives, and deliberately not lifted
 * into this view. The report that reads this is public, and «the observatory
 * publishes the telephone number of twenty-six thousand businesses» is not a
 * decision a read model should make on its own.
 *
 * `is_regulated` says a Bolivian regulator licenses this activity, and
 * `official_validation_source` names which register would confirm it. Neither
 * says the place has been confirmed. A reader who takes the first for the
 * second turns an unverified list into a directory of licensed premises, so
 * `validation_priority` travels beside them: it is the queue, not the verdict.
 */
export const cityPlaceView = `
CREATE VIEW read_models.city_place AS
SELECT
  fc.fact_claim_id,
  ro.payload_json ->> 'placeId'                 AS place_id,
  ro.payload_json ->> 'name'                    AS name,
  ro.payload_json ->> 'city'                    AS city,
  ro.payload_json ->> 'department'              AS department,
  ro.payload_json ->> 'zone'                    AS zone,
  ro.payload_json ->> 'zoneType'                AS zone_type,
  (ro.payload_json ->> 'latitude')::numeric     AS latitude,
  (ro.payload_json ->> 'longitude')::numeric    AS longitude,
  ro.payload_json ->> 'entityGroup'             AS entity_group,
  ro.payload_json ->> 'entityFamily'            AS entity_family,
  ro.payload_json ->> 'commercialRole'          AS commercial_role,
  (ro.payload_json ->> 'isRegulated')::boolean  AS is_regulated,
  ro.payload_json ->> 'basicCategory'           AS basic_category,
  (ro.payload_json ->> 'confidence')::numeric   AS confidence,
  ro.payload_json ->> 'qualityGrade'            AS quality_grade,
  ro.payload_json ->> 'address'                 AS address,
  ro.payload_json ->> 'brand'                   AS brand,
  ro.payload_json ->> 'officialValidationSource' AS official_validation_source,
  ro.payload_json ->> 'validationPriority'      AS validation_priority,
  ro.payload_json ->> 'publisher'               AS publisher,
  artifact.sha256                               AS evidence_sha256,
  fc.status,
  (fc.superseded_by_claim_id IS NOT NULL)       AS superseded
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'dataCategory' = 'CITY_POI';
`;

/**
 * How many places of each family each city holds, and how many of them are
 * regulated.
 *
 * A plain view and not a materialised one. The corpus is twenty-six thousand
 * rows, which groups in milliseconds; materialising it would buy nothing and
 * would add a refresh that must be remembered on every load — the cost the
 * press models pay because their corpus genuinely needs it.
 *
 * `OTRA_ENTIDAD` is not filtered out. It is the largest family by a distance,
 * and hiding it would let a reader believe the catalogue classifies more of the
 * city than it does.
 */
export const cityPlaceFamilyView = `
CREATE VIEW read_models.city_place_family AS
SELECT
  city,
  entity_group,
  entity_family,
  count(*)                                        AS places,
  count(*) FILTER (WHERE is_regulated)            AS regulated,
  count(*) FILTER (WHERE zone IS NOT NULL)        AS located_in_zone,
  round(avg(confidence), 4)                       AS mean_confidence
FROM read_models.city_place
WHERE status = 'PUBLISHED' AND NOT superseded
GROUP BY city, entity_group, entity_family;
`;

/**
 * The discriminator this corpus is read by, and the two columns every filter
 * lands on. Without the first, selecting the places means scanning every
 * observation the observatory holds.
 */
export const placeIndexes = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_city_poi
  ON intelligence.raw_observation ((payload_json ->> 'dataCategory'))
  WHERE payload_json ->> 'dataCategory' = 'CITY_POI';
CREATE INDEX IF NOT EXISTS ix_raw_observation_poi_city
  ON intelligence.raw_observation ((payload_json ->> 'city'))
  WHERE payload_json ->> 'dataCategory' = 'CITY_POI';
`;
