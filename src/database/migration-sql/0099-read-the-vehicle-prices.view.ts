/** Public offers keep their published snapshot and source digest. */
export const dropVehiclePriceViews = `
DROP VIEW IF EXISTS read_models.vehicle_price_offer;
DROP VIEW IF EXISTS read_models.vehicle_price_observation;
`;

export const vehiclePriceObservationView = `
CREATE VIEW read_models.vehicle_price_observation AS
SELECT
  ro.payload_json ->> 'type'                       AS body_type,
  ro.payload_json ->> 'brand'                      AS brand,
  ro.payload_json ->> 'model'                      AS model,
  ro.payload_json ->> 'version'                    AS version,
  (ro.payload_json ->> 'modelYear')::integer       AS model_year,
  (ro.payload_json ->> 'price')::numeric(16, 2)    AS price,
  ro.payload_json ->> 'currency'                   AS currency,
  ro.payload_json ->> 'priceType'                  AS price_type,
  (ro.payload_json ->> 'observedAt')::date         AS observed_at,
  ro.payload_json ->> 'source'                     AS source_url,
  ro.payload_json ->> 'transmission'               AS transmission,
  ro.payload_json ->> 'traction'                   AS traction,
  ro.payload_json ->> 'powertrain'                 AS powertrain,
  ro.payload_json ->> 'city'                       AS city,
  ro.payload_json ->> 'dealer'                     AS dealer,
  (ro.payload_json ->> 'validUntil')::date         AS valid_until,
  ro.payload_json ->> 'availability'               AS availability,
  artifact.sha256                                  AS source_sha256,
  ro.received_at                                   AS received_at
FROM intelligence.raw_observation ro
JOIN intelligence.fact_claim fc ON fc.raw_observation_id = ro.raw_observation_id
JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'dataCategory' = 'VEHICLE_PRICE_OFFER'
  AND fc.status = 'PUBLISHED'
  AND fc.superseded_by_claim_id IS NULL;
`;

export const vehiclePriceOfferView = `
CREATE VIEW read_models.vehicle_price_offer AS
SELECT DISTINCT ON (brand, model, version, model_year, source_url)
  body_type, brand, model, version, model_year, price, currency, price_type,
  observed_at, source_url, transmission, traction, powertrain, city, dealer,
  valid_until, availability, source_sha256
FROM read_models.vehicle_price_observation
ORDER BY brand, model, version, model_year, source_url, observed_at DESC, received_at DESC;
`;

export const vehiclePriceIndex = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_vehicle_price
  ON intelligence.raw_observation ((payload_json ->> 'dataCategory'))
  WHERE payload_json ->> 'dataCategory' = 'VEHICLE_PRICE_OFFER';
`;

export const vehiclePriceGrants = `
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.vehicle_price_observation TO %I', role_name);
      EXECUTE format('GRANT SELECT ON read_models.vehicle_price_offer TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;
