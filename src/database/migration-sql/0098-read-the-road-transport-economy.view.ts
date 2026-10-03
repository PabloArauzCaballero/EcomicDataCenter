const baseJoin = `
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id`;

const provenance = `
  artifact.metadata_json ->> 'sourceKey'              AS source_key,
  artifact.metadata_json ->> 'publisher'              AS publisher,
  artifact.metadata_json ->> 'title'                  AS source_title,
  artifact.original_uri                                AS source_url,
  artifact.sha256                                      AS evidence_sha256,
  fc.status                                             AS claim_status,
  (fc.superseded_by_claim_id IS NOT NULL)               AS superseded`;

export const dropRoadTransportViews = `
DROP VIEW IF EXISTS read_models.intercity_fare_band;
DROP VIEW IF EXISTS read_models.gnv_activity;
DROP VIEW IF EXISTS read_models.vehicle_fleet;
`;

export const vehicleFleetView = `
CREATE VIEW read_models.vehicle_fleet AS
SELECT DISTINCT ON (
  ro.payload_json ->> 'dimension', ro.payload_json ->> 'department',
  ro.payload_json ->> 'service', ro.payload_json ->> 'vehicleClass',
  ro.payload_json ->> 'capacityBand', ro.payload_json ->> 'period'
)
  fc.fact_claim_id,
  ro.payload_json ->> 'dimension'                     AS dimension,
  ro.payload_json ->> 'department'                    AS department,
  ro.payload_json ->> 'service'                       AS service,
  ro.payload_json ->> 'vehicleClass'                  AS vehicle_class,
  ro.payload_json ->> 'capacityBand'                  AS capacity_band,
  ro.payload_json ->> 'period'                        AS period,
  (ro.payload_json ->> 'value')::integer               AS value,
  (ro.payload_json ->> 'preliminary')::boolean         AS preliminary,${provenance}
${baseJoin}
WHERE ro.payload_json ->> 'dataCategory' = 'VEHICLE_FLEET'
ORDER BY
  ro.payload_json ->> 'dimension', ro.payload_json ->> 'department',
  ro.payload_json ->> 'service', ro.payload_json ->> 'vehicleClass',
  ro.payload_json ->> 'capacityBand', ro.payload_json ->> 'period',
  ro.received_at DESC;
`;

export const gnvActivityView = `
CREATE VIEW read_models.gnv_activity AS
SELECT DISTINCT ON (
  ro.payload_json ->> 'metric', ro.payload_json ->> 'dimension',
  ro.payload_json ->> 'department', ro.payload_json ->> 'vehicleClass',
  ro.payload_json ->> 'period'
)
  fc.fact_claim_id,
  ro.payload_json ->> 'metric'                        AS metric,
  ro.payload_json ->> 'dimension'                     AS dimension,
  ro.payload_json ->> 'department'                    AS department,
  ro.payload_json ->> 'vehicleClass'                  AS vehicle_class,
  ro.payload_json ->> 'period'                        AS period,
  (ro.payload_json ->> 'value')::integer               AS value,
  (ro.payload_json ->> 'preliminary')::boolean         AS preliminary,${provenance}
${baseJoin}
WHERE ro.payload_json ->> 'dataCategory' = 'GNV_ACTIVITY'
ORDER BY
  ro.payload_json ->> 'metric', ro.payload_json ->> 'dimension',
  ro.payload_json ->> 'department', ro.payload_json ->> 'vehicleClass',
  ro.payload_json ->> 'period', ro.received_at DESC;
`;

export const intercityFareBandView = `
CREATE VIEW read_models.intercity_fare_band AS
SELECT DISTINCT ON (
  ro.payload_json ->> 'regulation', ro.payload_json ->> 'origin',
  ro.payload_json ->> 'destination', ro.payload_json ->> 'road'
)
  fc.fact_claim_id,
  ro.payload_json ->> 'regulation'                    AS regulation,
  (ro.payload_json ->> 'publishedOn')::date            AS published_on,
  (ro.payload_json ->> 'effectiveFrom')::date          AS effective_from,
  NULLIF(ro.payload_json ->> 'effectiveUntil', '')::date AS effective_until,
  ro.payload_json ->> 'origin'                        AS origin,
  ro.payload_json ->> 'destination'                   AS destination,
  ro.payload_json ->> 'road'                          AS road,
  ro.payload_json ->> 'currency'                      AS currency,
  (ro.payload_json ->> 'normalMin')::numeric           AS normal_min,
  (ro.payload_json ->> 'normalMax')::numeric           AS normal_max,
  (ro.payload_json ->> 'semicamaMin')::numeric         AS semicama_min,
  (ro.payload_json ->> 'semicamaMax')::numeric         AS semicama_max,
  (ro.payload_json ->> 'camaMin')::numeric             AS cama_min,
  (ro.payload_json ->> 'camaMax')::numeric             AS cama_max,${provenance}
${baseJoin}
WHERE ro.payload_json ->> 'dataCategory' = 'INTERCITY_FARE_BAND'
ORDER BY
  ro.payload_json ->> 'regulation', ro.payload_json ->> 'origin',
  ro.payload_json ->> 'destination', ro.payload_json ->> 'road',
  ro.received_at DESC;
`;

const CATEGORIES = ['VEHICLE_FLEET', 'GNV_ACTIVITY', 'INTERCITY_FARE_BAND'] as const;

export const roadTransportIndexes = CATEGORIES.map(
  (category) => `
CREATE INDEX IF NOT EXISTS ix_raw_observation_${category.toLowerCase()}
  ON intelligence.raw_observation ((payload_json ->> 'dataCategory'))
  WHERE payload_json ->> 'dataCategory' = '${category}';`,
).join('\n');

export const dropRoadTransportIndexes = CATEGORIES.map(
  (category) => `DROP INDEX IF EXISTS intelligence.ix_raw_observation_${category.toLowerCase()};`,
).join('\n');

export const ROAD_TRANSPORT_VIEWS = ['vehicle_fleet', 'gnv_activity', 'intercity_fare_band'] as const;
