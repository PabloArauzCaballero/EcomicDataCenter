/**
 * The national place models exactly as migration 0073 wrote them.
 *
 * A snapshot, never edited: a later change to how the country's places are read
 * is a later migration with its own copy.
 */

export const dropNationalPlaceViews = `
DROP VIEW IF EXISTS read_models.national_place_family;
DROP VIEW IF EXISTS read_models.national_place;
`;

/**
 * One row per place in the country.
 *
 * Kept apart from `city_place` rather than folded into it. The three-city
 * corpus is one publisher inside three municipal polygons, with a city on every
 * row; this one is two publishers over the whole country with a city on none.
 * A union would have to answer «which city is this in» with a null for more
 * than half of the rows of a model whose name promises one, and it would change
 * what the existing report counts without anyone deciding that it should.
 *
 * `locality` is the town name Overture printed inside the address. It is not a
 * municipality and not a department — the delivery publishes neither, and its
 * `region` column is empty for 36.991 of 37.278 Overture records and holds `S`,
 * `L` or `H` in most of the rest. It is null for every OpenStreetMap row.
 *
 * `publisher` is on the row because the two halves are not interchangeable: the
 * Overture half carries a confidence, a contact and an address, and the
 * OpenStreetMap half carries none of the three. A reader who averages across
 * them without seeing which is which will mistake a missing number for a low
 * one.
 *
 * The contact details a place carries upstream — telephone, e-mail — are held
 * in the raw observation, where provenance lives, and deliberately not lifted
 * into this view, for the same reason they are not lifted into `city_place`:
 * the report that reads this is public.
 *
 * `is_regulated` says a Bolivian regulator licenses this activity, and
 * `official_validation_source` names which register would confirm it. Neither
 * says the place has been confirmed; the delivery states plainly that nothing
 * in it was checked in the field. `validation_priority` travels beside them: it
 * is the queue, not the verdict.
 */
export const nationalPlaceView = `
CREATE VIEW read_models.national_place AS
SELECT
  fc.fact_claim_id,
  ro.payload_json ->> 'placeId'                  AS place_id,
  ro.payload_json ->> 'publisher'                AS publisher,
  ro.payload_json ->> 'name'                     AS name,
  ro.payload_json ->> 'locality'                 AS locality,
  (ro.payload_json ->> 'latitude')::numeric      AS latitude,
  (ro.payload_json ->> 'longitude')::numeric     AS longitude,
  ro.payload_json ->> 'entityGroup'              AS entity_group,
  ro.payload_json ->> 'entityFamily'             AS entity_family,
  ro.payload_json ->> 'commercialRole'           AS commercial_role,
  (ro.payload_json ->> 'isRegulated')::boolean   AS is_regulated,
  (ro.payload_json ->> 'genericFamily')::boolean AS generic_family,
  ro.payload_json ->> 'basicCategory'            AS basic_category,
  (ro.payload_json ->> 'confidence')::numeric    AS confidence,
  ro.payload_json ->> 'positionMethod'           AS position_method,
  ro.payload_json ->> 'dataLevel'                AS data_level,
  ro.payload_json ->> 'address'                  AS address,
  ro.payload_json ->> 'officialValidationSource' AS official_validation_source,
  ro.payload_json ->> 'validationPriority'       AS validation_priority,
  ro.payload_json ->> 'licence'                  AS licence,
  artifact.sha256                                AS evidence_sha256,
  fc.status,
  (fc.superseded_by_claim_id IS NOT NULL)        AS superseded
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
 * A plain view and not a materialised one, for the reason 0070 gave: fifty
 * thousand rows group in milliseconds, and materialising would add a refresh
 * that must be remembered on every load.
 *
 * Four of the columns exist to stop an average from lying. `refined` counts the
 * places whose family was matched exactly rather than by the broad key the
 * delivery flags as `familia_generica_no_refinada`; `with_locality` counts the
 * ones that can be placed in a town at all; and the two publisher counts split
 * a family that looks evenly sourced but is not. `mean_confidence` is the mean
 * over the rows that carry a confidence, which is the Overture half alone —
 * OpenStreetMap publishes no such number, so the mean describes that half and
 * `from_overture` is how a reader sees how much of the family it covers.
 */
export const nationalPlaceFamilyView = `
CREATE VIEW read_models.national_place_family AS
SELECT
  entity_group,
  entity_family,
  count(*)                                                            AS places,
  count(*) FILTER (WHERE is_regulated)                                AS regulated,
  count(*) FILTER (WHERE NOT generic_family)                          AS refined,
  count(*) FILTER (WHERE locality IS NOT NULL)                        AS with_locality,
  count(*) FILTER (WHERE publisher = 'Overture Maps Foundation')      AS from_overture,
  count(*) FILTER (WHERE publisher = 'OpenStreetMap contributors')    AS from_openstreetmap,
  round(avg(confidence), 4)                                           AS mean_confidence
FROM read_models.national_place
WHERE status = 'PUBLISHED' AND NOT superseded
GROUP BY entity_group, entity_family;
`;

/**
 * The discriminator this corpus is read by, and the column a reader filters on.
 *
 * Without the first, selecting the national places means scanning every
 * observation the observatory holds — and this corpus roughly triples how many
 * of those there are.
 */
export const nationalPlaceIndexes = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_national_poi
  ON intelligence.raw_observation ((payload_json ->> 'dataCategory'))
  WHERE payload_json ->> 'dataCategory' = 'NATIONAL_POI';
CREATE INDEX IF NOT EXISTS ix_raw_observation_national_locality
  ON intelligence.raw_observation ((payload_json ->> 'locality'))
  WHERE payload_json ->> 'dataCategory' = 'NATIONAL_POI';
`;
