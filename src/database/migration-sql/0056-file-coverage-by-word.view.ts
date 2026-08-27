/**
 * The article view exactly as migration 0056 wrote it.
 *
 * A snapshot, never edited: a later change to how coverage is filed is a later
 * migration with its own copy, so rolling forward and back always replays the
 * definition that step actually applied.
 */

import { topicCase } from './0056-file-coverage-by-word.topics';

export const articleView = `
CREATE OR REPLACE VIEW read_models.press_article AS
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
${topicCase}
  CASE
    WHEN subject ~ ANY (ARRAY[
        '\\mfalso', '\\menganoso', '\\mmanipulad', '\\mdesmiente', '\\mdesinformacion',
        '\\msacado de contexto', '\\mverificac', '\\mno es cierto', '\\mfake', '\\mbulo\\M',
        '\\maclara que no'
    ]) THEN 'DESINFORMACION'
    WHEN subject ~ ANY (ARRAY[
        '\\mdesabastec', '\\mescasez', '\\mescasea', '\\mcolaps', '\\mcrisis', '\\mtemor',
        '\\mpanico', '\\malerta', '\\memergencia', '\\mfalta de', '\\macaparamiento',
        '\\mracionamiento', '\\magotad', '\\mdesesperac', '\\murgente', '\\mgrave',
        '\\mcritic', '\\mriesgo', '\\madvierte', '\\mpeligro', '\\msin stock',
        '\\msin combustible', '\\malarma', '\\mpreocupa', '\\mamenaz', '\\minsuficiente',
        '\\mfila(s)?\\M', '\\mcola(s)?\\M'
    ]) THEN 'ALARMA'
    WHEN subject ~ ANY (ARRAY[
        '\\mbloqueo', '\\mbloquea', '\\mparo\\M', '\\mprotesta', '\\mmovilizac',
        '\\mmarcha\\M', '\\mconflicto', '\\menfrentamiento', '\\mdenuncia', '\\mexige',
        '\\mrechaza', '\\minterpelac', '\\mhuelga', '\\mtranca', '\\mvigilia', '\\mdisputa',
        '\\macusa', '\\mquerella', '\\mpugna', '\\mpresion social', '\\mavasalla'
    ]) THEN 'CONFLICTO'
    WHEN subject ~ ANY (ARRAY[
        '\\mrumor', '\\mpresunt', '\\mversion\\M', '\\mincertidumbre', '\\mpodria',
        '\\mevalua', '\\manaliza', '\\mno confirm', '\\mpreve', '\\mproyecta', '\\mestima',
        '\\mplantea', '\\mpropone', '\\mestudia', '\\mnegocia', '\\mdefinira',
        '\\mpendiente', '\\men duda', '\\mexpectativa'
    ]) THEN 'INCERTIDUMBRE'
    WHEN subject ~ ANY (ARRAY[
        '\\mcaida', '\\mcae', '\\mcayo', '\\mcayeron', '\\mbaja\\M', '\\mbajan\\M',
        '\\mbajaron', '\\mcayo\\M', '\\mdeficit', '\\mperdida', '\\mcontraccion',
        '\\mfracaso', '\\mincumplimiento', '\\mmora\\M', '\\ma la baja', '\\mretroces',
        '\\mafectad', '\\mgolpead', '\\mdesplom', '\\mreduc', '\\mdisminu', '\\mrecort',
        '\\msuspend', '\\mparaliz', '\\mcierr', '\\mquiebra', '\\matraso', '\\mretras',
        '\\mpierde', '\\mperdio', '\\mendeud', '\\minsostenible', '\\manula', '\\mvictima',
        '\\magrav', '\\mempeor', '\\mestanca', '\\mdesacelera'
    ]) THEN 'DETERIORO'
    WHEN subject ~ ANY (ARRAY[
        '\\macuerdo', '\\minversion', '\\mcrece', '\\mcrecen', '\\mcrecio', '\\mcreceran',
        '\\mrepunt', '\\maumento', '\\maument', '\\mrecuperac', '\\mrecord\\M', '\\malza\\M',
        '\\mimpuls', '\\mamplia', '\\mhabilit', '\\minaugur', '\\msube', '\\msuben',
        '\\msubio\\M', '\\mincrement', '\\mmejora', '\\mconvenio', '\\mduplica', '\\mavanz',
        '\\mlogr', '\\maprob', '\\maprueba', '\\mreactiv', '\\mnuevo mercado',
        '\\mbeneficia', '\\mfortalec', '\\mboom\\M', '\\mgana\\M', '\\mganan\\M',
        '\\mganaron', '\\mgano\\M', '\\mexitos', '\\mexito\\M', '\\msupera'
    ]) THEN 'MEJORA'
    WHEN subject ~ ANY (ARRAY[
        '\\manunci', '\\mimplementa', '\\mcrea', '\\mlanza', '\\mpromulg', '\\mdecret',
        '\\mautoriz', '\\madjudic', '\\mregula', '\\mdispone', '\\mestablec', '\\mpresenta',
        '\\minicia', '\\marranca', '\\mpone en marcha', '\\mpide', '\\mpiden', '\\msolicita',
        '\\mrecomienda', '\\mconvoca', '\\minstruye', '\\mdetermina', '\\moficializa',
        '\\mreglamenta', '\\mmodific', '\\mdefine', '\\mactiva\\M', '\\mpromueve',
        '\\midentifica', '\\mprepara', '\\mproyecto de ley', '\\mfirma', '\\macuerda',
        '\\mentrega', '\\mcompra\\M', '\\madquier', '\\mdestina', '\\minvierte',
        '\\mgarantiza', '\\msuscribe'
    ]) THEN 'MEDIDA'
    ELSE 'NEUTRO'
  END AS tone,
  CASE
    WHEN subject ~ ANY (ARRAY[
        '\\msanta cruz', '\\mmontero\\M'
    ]) THEN 'SANTA_CRUZ'
    WHEN subject ~ ANY (ARRAY[
        '\\mla paz\\M', '\\mel alto\\M'
    ]) THEN 'LA_PAZ'
    WHEN subject ~ ANY (ARRAY[
        '\\mcochabamba', '\\mchapare\\M'
    ]) THEN 'COCHABAMBA'
    WHEN subject ~ ANY (ARRAY[
        '\\moruro\\M'
    ]) THEN 'ORURO'
    WHEN subject ~ ANY (ARRAY[
        '\\mpotosi\\M'
    ]) THEN 'POTOSI'
    WHEN subject ~ ANY (ARRAY[
        '\\mtarija\\M', '\\myacuiba\\M'
    ]) THEN 'TARIJA'
    WHEN subject ~ ANY (ARRAY[
        '\\mchuquisaca\\M', '\\msucre\\M'
    ]) THEN 'CHUQUISACA'
    WHEN subject ~ ANY (ARRAY[
        '\\mbeni\\M', '\\mtrinidad\\M'
    ]) THEN 'BENI'
    WHEN subject ~ ANY (ARRAY[
        '\\mpando\\M', '\\mcobija\\M'
    ]) THEN 'PANDO'
    ELSE 'NACIONAL'
  END AS region
FROM published,
  LATERAL (
    SELECT translate(
      lower(coalesce(headline, '') || ' ' || coalesce(summary, '')),
      'áéíóúüñÁÉÍÓÚÜÑ',
      'aeiouunaeiouun'
    )
  ) AS terms(subject);
`;
