/**
 * Las cuentas públicas, abiertas para la lectura.
 *
 * El sembrador `public-accounts` guarda cada serie como UNA observación —nombre, tema,
 * perímetro, unidad, frecuencia y todos sus puntos— con su afirmación y su evidencia. Una
 * sola vista las lee: son cientos de series y pocos miles de puntos, así que a diferencia
 * de las estadísticas del Banco Central no hace falta separar el catálogo de los datos.
 *
 * Un cuaderno que el Ministerio revisa trae las mismas series con algún punto distinto, y
 * entra bajo una huella nueva. La vista se queda con la observación recibida más tarde de
 * cada código; las anteriores quedan como evidencia de lo que se publicó antes.
 *
 * Fuera de las vistas de indicadores a propósito: el sembrador escribe estas observaciones
 * sin arreglo `measures`, así que ni el panel diario ni el anual las recogen.
 */

export const dropPublicAccountViews = `
DROP VIEW IF EXISTS read_models.public_account_series;
`;

export const publicAccountSeriesView = `
CREATE VIEW read_models.public_account_series AS
SELECT DISTINCT ON (ro.payload_json ->> 'indicatorCode')
  ro.payload_json ->> 'indicatorCode'  AS indicator_code,
  ro.payload_json ->> 'name'           AS name,
  ro.payload_json ->> 'family'         AS family,
  ro.payload_json ->> 'topic'          AS topic,
  ro.payload_json ->> 'place'          AS place,
  ro.payload_json ->> 'concept'        AS concept,
  ro.payload_json ->> 'perimeter'      AS perimeter,
  ro.payload_json ->> 'unit'           AS unit,
  ro.payload_json ->> 'frequency'      AS frequency,
  ro.payload_json ->> 'publisher'      AS publisher,
  ro.payload_json -> 'locator'         AS locator,
  ro.payload_json -> 'points'          AS points,
  ro.received_at,
  artifact.original_uri                AS source_url,
  artifact.sha256                      AS evidence_sha256
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'dataCategory' = 'PUBLIC_ACCOUNT_SERIES'
  AND fc.status = 'PUBLISHED'
  AND fc.superseded_by_claim_id IS NULL
ORDER BY
  ro.payload_json ->> 'indicatorCode',
  ro.received_at DESC,
  ro.raw_observation_id DESC;
`;

export const publicAccountIndexes = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_public_accounts
  ON intelligence.raw_observation ((payload_json ->> 'indicatorCode'))
  WHERE payload_json ->> 'dataCategory' = 'PUBLIC_ACCOUNT_SERIES';
`;

export const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.public_account_series TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;
