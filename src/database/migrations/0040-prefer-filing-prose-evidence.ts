import type { MigrationContext } from '../migration.types';

/**
 * Picks the filing's own text by what it is, not by how long it is.
 *
 * The model this replaces took the longest evidence on a claim, on the
 * reasoning that a filing's page says more than the register's summary of it.
 * It usually does — but not always: a two-line board resolution runs shorter
 * than the JSON record that summarises it, and for twenty-one filings the
 * report fell back to showing the record.
 *
 * Length was a proxy for the real question, which is which document the
 * evidence came from. The register's evidence is that record, and a record is
 * recognisable: it is the one that opens as JSON. So prose is preferred over
 * it outright, and length only breaks ties among prose.
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
    ORDER BY (left(btrim(ce.excerpt), 1) = '{'), length(ce.excerpt) DESC, ce.claim_evidence_id
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
