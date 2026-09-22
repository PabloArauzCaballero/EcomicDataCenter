import type { MigrationContext } from '../migration.types';

/**
 * Takes the listing's digest from the artifact instead of from the payload.
 *
 * The model this replaces read `sha256` out of the observation's payload, which
 * put a document-level fact inside a record about an article. Two costs
 * followed. The digest changes every time a listing is fetched, so re-reading
 * the same headline produced a different payload and a second record for one
 * article. And an observation was carrying a property of the thing it arrived
 * in rather than of the thing it is.
 *
 * The artifact has held that digest all along. Reading it from there makes an
 * article's identity depend on the article — outlet, address, headline, date —
 * so collecting twice converges instead of accumulating.
 *
 * Everything else is carried over unchanged from the model it replaces,
 * including the derived subject.
 */

const dropView = `DROP VIEW IF EXISTS read_models.press_article;`;

const articleView = `
CREATE VIEW read_models.press_article AS
WITH published AS (
  SELECT
    fc.fact_claim_id,
    ro.raw_observation_id,
    fc.event_date,
    fc.published_at,
    ro.received_at,
    ro.payload_json ->> 'outlet'          AS outlet,
    ro.payload_json ->> 'domain'          AS domain,
    ro.payload_json ->> 'section'         AS section,
    ro.payload_json ->> 'headline'        AS headline,
    ro.payload_json ->> 'summary'         AS summary,
    ro.payload_json ->> 'statedInstant'   AS stated_instant,
    ro.payload_json ->> 'url'             AS article_url,
    ro.payload_json ->> 'listingUrl'      AS listing_url,
    artifact.sha256                       AS evidence_sha256,
    ro.payload_json ->> 'retrievalMethod' AS retrieval_method,
    fc.confidence_level,
    fc.status,
    (fc.superseded_by_claim_id IS NOT NULL) AS superseded,
    fc.assertion,
    evidence.excerpt
  FROM intelligence.fact_claim fc
  JOIN intelligence.raw_observation ro
    ON ro.raw_observation_id = fc.raw_observation_id
  JOIN provenance.source_artifact artifact
    ON artifact.source_artifact_id = ro.source_artifact_id
  LEFT JOIN LATERAL (
    SELECT ce.excerpt
    FROM intelligence.claim_evidence ce
    WHERE ce.fact_claim_id = fc.fact_claim_id
    ORDER BY ce.claim_evidence_id
    LIMIT 1
  ) AS evidence ON true
  WHERE ro.payload_json ->> 'dataCategory' = 'PRESS_COVERAGE'
    AND ro.payload_json ->> 'headline' IS NOT NULL
)
SELECT
  published.*,
  CASE
    WHEN subject ILIKE ANY (ARRAY[
      '%diésel%', '%diesel%', '%gasolina%', '%combustible%', '%carburante%',
      '%ypfb%', '%hidrocarburo%', '%surtidor%', '%gas natural%', '%anh%'
    ]) THEN 'HIDROCARBUROS'
    WHEN subject ILIKE ANY (ARRAY[
      '%tipo de cambio%', '%dólar%', '%dolar%', '%brecha cambiaria%', '%divisa%',
      '%paralelo%', '%bolivianos por%'
    ]) THEN 'CAMBIARIO'
    WHEN subject ILIKE ANY (ARRAY[
      '%inflación%', '%inflacion%', '%canasta%', '%carestía%', '%carestia%',
      '%precio%', '%encarec%', '%ipc%'
    ]) THEN 'PRECIOS'
    WHEN subject ILIKE ANY (ARRAY[
      '%banco central%', '%bcb%', '%reservas internacionales%', '%crédito%',
      '%credito%', '%tasa de interés%', '%asfi%', '%bolsa de valores%',
      '%sistema financiero%', '%banca%'
    ]) THEN 'MONETARIO'
    WHEN subject ILIKE ANY (ARRAY[
      '%déficit%', '%deficit%', '%presupuesto%', '%deuda %', '%bonos soberanos%',
      '%impuesto%', '%subvención%', '%subvencion%', '%subsidio%', '%tesoro general%'
    ]) THEN 'FISCAL'
    WHEN subject ILIKE ANY (ARRAY[
      '%exportación%', '%exportacion%', '%importación%', '%importacion%',
      '%arancel%', '%balanza comercial%', '%contrabando%'
    ]) THEN 'COMERCIO_EXTERIOR'
    WHEN subject ILIKE ANY (ARRAY[
      '%empleo%', '%salario%', '%desempleo%', '%aguinaldo%', '%trabajadores%',
      '%gremial%', '%sindicat%'
    ]) THEN 'LABORAL'
    WHEN subject ILIKE ANY (ARRAY[
      '%producción%', '%produccion%', '%industria%', '%agro%', '%soya%',
      '%minería%', '%mineria%', '%maíz%', '%maiz%', '%sorgo%', '%arroz%',
      '%hectárea%', '%hectarea%', '%empresari%', '%exportador%', '%ganader%'
    ]) THEN 'SECTOR_REAL'
    ELSE 'OTROS'
  END AS topic
FROM published,
  LATERAL (SELECT coalesce(headline, '') || ' ' || coalesce(summary, '')) AS terms(subject);
`;

const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.press_article TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropView);
  await context.sequelize.query(articleView);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropView);
}
