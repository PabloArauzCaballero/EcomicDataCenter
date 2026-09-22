/**
 * The filing view exactly as migration 0061 wrote it.
 *
 * A snapshot, never edited: a later change to how the register is filed is a
 * later migration with its own copy, so rolling forward and back always
 * replays the definition that step actually applied.
 */

export const filingView = `
CREATE OR REPLACE VIEW read_models.company_filing AS
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
  END AS sector,
  CASE
    WHEN matter ~ ANY (ARRAY[
      'calificacion', 'calificaciones', 'calificadora', 'clasificadora', 'rating',
      'aesa', 'pacific credit', 'moody', 'fitch', 'equilibrium'
    ]) THEN 'CALIFICACION'
    WHEN matter ~ ANY (ARRAY[
      'patrimonio autonomo', 'emision', 'bonos', 'pagares bursatiles', 'redencion',
      'titulariz', 'cupon', 'prospecto', 'inscripcion', 'oferta publica', 'colocacion',
      'fondo de liquidez', 'mecanismo de cobertura', 'provision de fondos',
      'recaudacion de fondos', 'pago de interes', 'cuotas de participacion',
      'comite de inversion'
    ]) THEN 'EMISION'
    WHEN matter ~ ANY (ARRAY[
      'prestamo', 'credito', 'desembolso', 'pagare', 'avance en cuenta',
      'linea de credito', 'financiamiento', 'endeudamiento', 'compromisos financieros',
      'garantia', 'fianza', 'leasing', 'obligacion subordinada'
    ]) THEN 'FINANCIAMIENTO'
    WHEN matter ~ ANY (ARRAY[
      'dividendo', 'aumento de capital', 'reduccion de capital',
      'transferencia de acciones', 'subasta de acciones', 'suscripcion de acciones',
      'capital pagado', 'reinversion de utilidades', 'distribucion de utilidades',
      'recompra', 'aporte de capital'
    ]) THEN 'CAPITAL'
    WHEN matter ~ ANY (ARRAY[
      'ejecutivo', 'gerente', 'designacion', 'nombramiento', 'renuncia', 'suplencia',
      'ausencia', 'interin', 'posesion', 'remocion', 'vacacion', 'encargatur',
      'firmas autorizadas', 'retorno a sus funciones', 'cese de funciones',
      'cambio de firma'
    ]) THEN 'EJECUTIVOS'
    WHEN matter ~ ANY (ARRAY[
      'poder', 'apoderado', 'revocatoria', 'mandato', 'delegacion de atribuciones'
    ]) THEN 'PODERES'
    WHEN matter ~ ANY (ARRAY[
      'junta general', 'asamblea', 'convocatoria', 'socios', 'accionistas'
    ]) THEN 'JUNTA'
    WHEN matter ~ ANY (ARRAY[
      'directorio', 'gerencia general', 'subgerencia general', 'comite de',
      'consejo de administracion', 'consejo de vigilancia', 'sindico', 'mesa directiva',
      'cambios? en la (organizacion|estructura)', 'estructura organizacional',
      'reorganizacion'
    ]) THEN 'DIRECTORIO'
    WHEN matter ~ ANY (ARRAY[
      'estados financieros', 'memoria anual', 'auditoria', 'auditor', 'balance',
      'informe trimestral', 'dictamen'
    ]) THEN 'ESTADOS'
    WHEN matter ~ ANY (ARRAY[
      'asfi', 'autoridad de supervision', 'resolucion', 'reglamento', 'estatuto',
      'licencia', 'sancion', 'multa', 'normativa', 'registro del mercado',
      'no objecion', 'capital regulatorio'
    ]) THEN 'REGULATORIO'
    WHEN matter ~ ANY (ARRAY[
      'contrato', 'adjudicacion', 'convenio', 'acuerdo', 'adquisicion', 'fusion',
      'escision', 'venta de', 'compra de', 'inversion en', 'sucursal', 'agencia',
      'apertura', 'cierre de', 'inicio de actividades', 'proyecto', 'planta',
      'siniestro', 'incendio', 'paro', 'bloqueo', 'horario'
    ]) THEN 'OPERACIONES'
    ELSE 'OTROS'
  END AS category
FROM filed,
  LATERAL (
    SELECT translate(lower(subject), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')
  ) AS matters(matter);
`;
