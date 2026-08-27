import type { MigrationContext } from '../migration.types';

/**
 * Exposes the text each filing states on its own page.
 *
 * The register the archive was captured from summarises: its records carry an
 * `abstract` the exchange has already cut short, so the report could show an
 * ellipsis and nothing past it. Each filing's own page carries what was
 * communicated, and that page is now loaded as a second piece of evidence on
 * the same claim.
 *
 * So the model reads two excerpts rather than one. `excerpt` stays what it was
 * — the first evidence recorded, which for the archive is the verbatim register
 * record and is what a reader checks a field against. `document_text` is the
 * longest evidence on the claim, which is that page's text where it was
 * captured and falls back to the same fragment where it was not.
 *
 * The industry classification is carried over unchanged from the model this
 * replaces; only the two evidence columns are new.
 *
 * Idempotent like the models before it: dropped before being recreated.
 */

const dropView = `DROP VIEW IF EXISTS read_models.company_filing;`;

const filingView = `
CREATE VIEW read_models.company_filing AS
WITH filed AS (
  SELECT
    fc.fact_claim_id,
    ro.raw_observation_id,
    fc.event_date,
    fc.published_at,
    ro.received_at,
    ro.payload_json ->> 'filer'                            AS filer,
    ro.payload_json ->> 'filerCode'                        AS filer_code,
    (ro.payload_json ->> 'filingId')::bigint               AS filing_id,
    ro.payload_json ->> 'subject'                          AS subject,
    ro.payload_json ->> 'statedInstant'                    AS stated_instant,
    (ro.payload_json ->> 'publicationInDocument')::boolean AS instant_stated_in_document,
    ro.payload_json ->> 'publisher'                        AS publisher,
    (ro.payload_json ->> 'publisherVerified')::boolean     AS publisher_verified,
    ro.payload_json ->> 'url'                              AS source_url,
    ro.payload_json ->> 'sha256'                           AS evidence_sha256,
    fc.confidence_level,
    fc.impact_level,
    fc.status,
    (fc.superseded_by_claim_id IS NOT NULL)                AS superseded,
    fc.assertion,
    evidence.excerpt,
    document.excerpt AS document_text,
    document.locator AS document_url
  FROM intelligence.fact_claim fc
  JOIN intelligence.raw_observation ro
    ON ro.raw_observation_id = fc.raw_observation_id
  LEFT JOIN LATERAL (
    SELECT ce.excerpt
    FROM intelligence.claim_evidence ce
    WHERE ce.fact_claim_id = fc.fact_claim_id
    ORDER BY ce.claim_evidence_id
    LIMIT 1
  ) AS evidence ON true
  LEFT JOIN LATERAL (
    SELECT ce.excerpt, ce.locator
    FROM intelligence.claim_evidence ce
    WHERE ce.fact_claim_id = fc.fact_claim_id
    ORDER BY length(ce.excerpt) DESC, ce.claim_evidence_id
    LIMIT 1
  ) AS document ON true
  WHERE ro.payload_json ->> 'dataCategory' = 'COMPANY_NEWS'
    AND ro.payload_json ->> 'subject' IS NOT NULL
)
SELECT
  filed.*,
  CASE
    WHEN filer ILIKE ANY (ARRAY[
      '%agencia de bolsa%', '%fondos de inversion%', '%fondos de inversión%',
      '%titulariza%', '%bolsa boliviana de valores%', '%securities%', '%safi%'
    ]) THEN 'MERCADO_VALORES'
    WHEN filer ILIKE ANY (ARRAY[
      '%seguros%', '%reaseguros%', '%vitalicia%', '%nacional vida%'
    ]) THEN 'SEGUROS'
    WHEN filer ILIKE ANY (ARRAY[
      '%banco%', '%bancosol%', '%cooperativa de ahorro%', '%leasing%',
      '%institucion financiera de desarrollo%', '%institución financiera de desarrollo%',
      '%grupo financiero%'
    ]) THEN 'FINANCIERO'
    WHEN filer ILIKE ANY (ARRAY[
      '%ypfb%', '%equipetrol%', '%petrolero%', '%hidrocarburo%'
    ]) THEN 'HIDROCARBUROS'
    WHEN filer ILIKE ANY (ARRAY[
      '%ende %', '%electricidad%', '%electrica%', '%eléctrica%', '%energia%',
      '%energía%', '%bolivian power%', '%corani%'
    ]) THEN 'ELECTRICIDAD'
    WHEN filer ILIKE ANY (ARRAY[
      '%minera%', '%mineria%', '%minería%'
    ]) THEN 'MINERIA'
    WHEN filer ILIKE ANY (ARRAY[
      '%oleagin%', '%aceite%', '%avicola%', '%avícola%', '%frigorifico%',
      '%frigorífico%', '%agroindustrial%', '%agropecuar%', '%nutrioil%'
    ]) THEN 'AGROINDUSTRIA'
    WHEN filer ILIKE ANY (ARRAY[
      '%clinica%', '%clínica%', '%drogueria%', '%droguería%', '%farmac%', '%laboratorio%'
    ]) THEN 'SALUD'
    WHEN filer ILIKE ANY (ARRAY[
      '%hotelera%', '%parque industrial%', '%turismo%'
    ]) THEN 'SERVICIOS'
    WHEN filer ILIKE ANY (ARRAY[
      '%cemento%', '%textil%', '%plastiforte%', '%tubos%', '%industria%',
      '%manufactur%', '%fabrica%', '%fábrica%'
    ]) THEN 'MANUFACTURA'
    WHEN filer ILIKE ANY (ARRAY[
      '%ferroviaria%', '%transporte%'
    ]) THEN 'TRANSPORTE'
    WHEN filer ILIKE ANY (ARRAY[
      '%comercializadora%', '%distribucion%', '%distribución%', '%mayoreo%',
      '%import%', '%almacenes%', '%toyosa%', '%comercio%'
    ]) THEN 'COMERCIO'
    WHEN filer ILIKE ANY (ARRAY[
      '%construccion%', '%construcción%', '%incotec%', '%ingenieria%', '%ingeniería%'
    ]) THEN 'CONSTRUCCION'
    WHEN filer ILIKE ANY (ARRAY[
      '%soft%', '%datec%', '%tecnolog%', '%telecom%'
    ]) THEN 'TECNOLOGIA'
    ELSE 'OTROS'
  END AS sector
FROM filed;
`;

const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.company_filing TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropView);
  await context.sequelize.query(filingView);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropView);
}
