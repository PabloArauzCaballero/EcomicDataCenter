import type { MigrationContext } from '../migration.types';

/**
 * Derives the tone and the region of each piece of press coverage.
 *
 * What this is, said plainly: a lexicon. It matches words an economist watches
 * against the headline and standfirst, and reports which category matched. It
 * is not emotion detection and it is not a model — it cannot read irony, it
 * does not know who is speaking, and a headline quoting someone else's alarm
 * scores as alarm. Those limits are the price of a measure a reader can audit
 * word by word and argue with, which a sentiment model's number is not.
 *
 * The categories are chosen for what they change in a decision rather than for
 * how a reader feels. ALARMA is shortage and collapse language; CONFLICTO is
 * blockades and strikes, which move prices before any index does; DETERIORO and
 * MEJORA are direction; INCERTIDUMBRE is the hedging vocabulary that marks a
 * rumour rather than a fact; DESINFORMACION is the verifier's own vocabulary,
 * which is how fact-checking coverage identifies itself.
 *
 * Order matters and is deliberate: alarm and conflict outrank direction,
 * because a story about a blockade that also says prices rose is about the
 * blockade. NEUTRO is what no rule claimed, never a default the reader should
 * read as "calm".
 *
 * The region is the department a story names. Coverage that names none is
 * NACIONAL rather than being assigned to the outlet's home city, which would
 * make every Santa Cruz paper look like a Santa Cruz story.
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
  END AS topic,
  CASE
    WHEN subject ILIKE ANY (ARRAY[
      '%falso%', '%engañoso%', '%enganoso%', '%manipulad%', '%desmiente%',
      '%desinformación%', '%desinformacion%', '%sacado de contexto%',
      '%verificación%', '%verificacion%', '%no es cierto%'
    ]) THEN 'DESINFORMACION'
    WHEN subject ILIKE ANY (ARRAY[
      '%desabastecimiento%', '%escasez%', '%no hay %', '%colapso%', '%crisis%',
      '%temor%', '%pánico%', '%panico%', '%alerta%', '%emergencia%', '%falta de %',
      '%acaparamiento%', '%especulación%', '%especulacion%', '%fila%', '%cola%'
    ]) THEN 'ALARMA'
    WHEN subject ILIKE ANY (ARRAY[
      '%bloqueo%', '%paro %', '%protesta%', '%movilizac%', '%marcha%',
      '%conflicto%', '%enfrentamiento%', '%amenaza%', '%denuncia%', '%exige%',
      '%rechaza%', '%interpelac%'
    ]) THEN 'CONFLICTO'
    WHEN subject ILIKE ANY (ARRAY[
      '%rumor%', '%presunt%', '%versión%', '%version%', '%incertidumbre%',
      '%podría%', '%podria%', '%evalúa%', '%evalua%', '%analiza%', '%no confirm%'
    ]) THEN 'INCERTIDUMBRE'
    WHEN subject ILIKE ANY (ARRAY[
      '%caída%', '%caida%', '%déficit%', '%deficit%', '%pérdida%', '%perdida%',
      '%contracción%', '%contraccion%', '%fracaso%', '%incumplimiento%',
      '%mora%', '%baja%', '%retroces%', '%afectad%', '%golpead%'
    ]) THEN 'DETERIORO'
    WHEN subject ILIKE ANY (ARRAY[
      '%acuerdo%', '%inversión%', '%inversion%', '%crecimiento%', '%aumento%',
      '%recuperac%', '%récord%', '%record%', '%alza%', '%impulsa%', '%amplía%',
      '%amplia%', '%firma%', '%habilita%', '%inaugura%'
    ]) THEN 'MEJORA'
    ELSE 'NEUTRO'
  END AS tone,
  CASE
    WHEN subject ILIKE '%santa cruz%' THEN 'SANTA_CRUZ'
    WHEN subject ILIKE '%la paz%' OR subject ILIKE '%el alto%' THEN 'LA_PAZ'
    WHEN subject ILIKE '%cochabamba%' THEN 'COCHABAMBA'
    WHEN subject ILIKE '%oruro%' THEN 'ORURO'
    WHEN subject ILIKE '%potosí%' OR subject ILIKE '%potosi%' THEN 'POTOSI'
    WHEN subject ILIKE '%tarija%' THEN 'TARIJA'
    WHEN subject ILIKE '%chuquisaca%' OR subject ILIKE '%sucre%' THEN 'CHUQUISACA'
    WHEN subject ILIKE '%beni%' OR subject ILIKE '%trinidad%' THEN 'BENI'
    WHEN subject ILIKE '%pando%' OR subject ILIKE '%cobija%' THEN 'PANDO'
    ELSE 'NACIONAL'
  END AS region
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
