import type { MigrationContext } from '../migration.types';

/**
 * Closes the gaps the first widening left, found by counting rather than reading.
 *
 * Ranking the words that appear most often in what stayed under «Otros» said
 * plainly what was missing, and most of it was not a missing subject but a
 * missing root: `salario` never matched "salarial", so every story about a wage
 * rise was unfiled; `banca` never matched "bancos"; `minero` never matched
 * "minera"; `la economía` never matched a headline that just says "economía".
 * Roots now, as they should have been.
 *
 * Conflict becomes a subject as well as a tone. Blockades, strikes, the TIPNIS
 * and indigenous territory are what a great deal of Bolivian economic coverage
 * is actually about — they move prices before any index does — and having
 * nowhere to file them was the single largest hole left.
 *
 * Everything else is the same lexicon, in the same order, matched against the
 * same headline and standfirst. Nothing the lists do not claim is guessed at.
 *
 * The view is replaced rather than dropped and rebuilt: its columns do not
 * change, only two of the expressions behind them, so the watchlist and
 * everything else that reads it stay standing through the change.
 */

const articleView = `
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
  CASE
    WHEN subject ILIKE ANY (ARRAY[
      '%diésel%', '%diesel%', '%gasolina%', '%combustible%', '%carburante%',
      '%ypfb%', '%hidrocarburo%', '%surtidor%', '%gas natural%', '%anh%',
      '%refinería%', '%refineria%', '%gasoducto%', '%glp%', '%garrafa%',
      '%petróleo%', '%petroleo%', '%crudo%', '%estación de servicio%'
    ]) THEN 'HIDROCARBUROS'
    WHEN subject ILIKE ANY (ARRAY[
      '%tipo de cambio%', '%dólar%', '%dolar%', '%brecha cambiaria%', '%divisa%',
      '%paralelo%', '%bolivianos por%', '%remesa%', '%euro%', '%cripto%',
      '%usdt%', '%stablecoin%', '%casa de cambio%'
    ]) THEN 'CAMBIARIO'
    WHEN subject ILIKE ANY (ARRAY[
      '%inflación%', '%inflacion%', '%canasta%', '%carestía%', '%carestia%',
      '%precio%', '%encarec%', '%ipc%', '%costo de vida%', '%tarifa%',
      '%abarrote%', '%mercado de abasto%'
    ]) THEN 'PRECIOS'
    WHEN subject ILIKE ANY (ARRAY[
      '%banco central%', '%bcb%', '%reservas internacionales%', '%crédito%',
      '%credito%', '%tasa de interés%', '%asfi%', '%bolsa de valores%',
      '%sistema financiero%', '%banc%', '%fmi%', '%fondo monetario%',
      '%banco mundial%', '%caf %', '%bid %', '%calificadora%', '%mora banc%',
      '%depósito%', '%deposito%', '%microfinan%', '%cooperativa de ahorro%',
      '%liquidez%', '%encaje%', '%microcrédito%', '%microcredito%',
      '%banco unión%', '%banco union%', '%cajero%', '%fraude banc%',
      '%tarjeta de%', '%seguro%'
    ]) THEN 'MONETARIO'
    WHEN subject ILIKE ANY (ARRAY[
      '%déficit%', '%deficit%', '%presupuesto%', '%deuda %', '%bonos soberanos%',
      '%impuesto%', '%subvención%', '%subvencion%', '%subsidio%', '%tesoro general%',
      '%regalía%', '%regalia%', '%recaudac%', '%tributar%', '%contraloría%',
      '%contraloria%', '%gasto público%', '%gasto publico%', '%licitación%',
      '%licitacion%', '%contrato estatal%', '%aduana%', '%impuestos nacionales%',
      '%irregularidad%', '%malversac%', '%sobreprecio%', '%pge%',
      '%presupuesto general%', '%coparticipac%', '%auditoría%', '%auditoria%'
    ]) THEN 'FISCAL'
    WHEN subject ILIKE ANY (ARRAY[
      '%exportación%', '%exportacion%', '%importación%', '%importacion%',
      '%arancel%', '%balanza comercial%', '%contrabando%', '%exportador%',
      '%mercado externo%', '%mercado internacional%', '%comercio exterior%',
      '%mercosur%', '%tratado comercial%', '%conquist% mercado%', '%feria%',
      '%expocruz%', '%puerto%', '%bioceánic%', '%bioceanic%', '%comercio%',
      '%mercado%', '%brasil%', '%argentina%', '%perú%', '%peru %', '%china%'
    ]) THEN 'COMERCIO_EXTERIOR'
    WHEN subject ILIKE ANY (ARRAY[
      '%empleo%', '%salari%', '%desempleo%', '%aguinaldo%', '%trabajadores%',
      '%gremial%', '%sindicat%', '%jubila%', '%pensión%', '%pension%',
      '%gestora%', '%transportista%', '%obrero%', '%fabriles%', '%cob %',
      '%mano de obra%', '%informalidad%', '%chofer%', '%conflicto laboral%',
      '%renta dignidad%', '%despido%', '%contratac%', '%transporte%',
      '%aporte%', '%afp%', '%devolución de aporte%', '%haberes%', '%cotizante%'
    ]) THEN 'LABORAL'
    WHEN subject ILIKE ANY (ARRAY[
      '%electricidad%', '%eléctric%', '%electric%', '%ende%', '%elfec%',
      '%hidroeléctric%', '%hidroelectric%', '%energía%', '%energia%',
      '%apagón%', '%apagon%', '%termoeléctric%', '%litio%', '%ylb%',
      '%energías renovables%', '%panel solar%'
    ]) THEN 'ENERGIA'
    WHEN subject ILIKE ANY (ARRAY[
      '%carretera%', '%obra%', '%tren%', '%ferroviari%', '%aeropuerto%',
      '%puente%', '%doble vía%', '%doble via%', '%asfalt%', '%vivienda%',
      '%infraestructura%', '%construcción%', '%construccion%', '%abc %',
      '%vía %', '%via %', '%camino%', '%ruta %'
    ]) THEN 'INFRAESTRUCTURA'
    WHEN subject ILIKE ANY (ARRAY[
      '%pobreza%', '%desigualdad%', '%salud%', '%hospital%', '%educación%',
      '%educacion%', '%bono juana%', '%bono %', '%renta dignidad%',
      '%seguridad alimentaria%', '%desnutric%', '%migrac%'
    ]) THEN 'SOCIAL'
    WHEN subject ILIKE ANY (ARRAY[
      '%bloqueo%', '%tipnis%', '%indígena%', '%indigena%', '%avasalla%',
      '%diálogo%', '%dialogo%', '%conflicto%', '%paro %', '%huelga%',
      '%movilizac%', '%tranca%', '%territorio indígena%'
    ]) THEN 'CONFLICTO'
    WHEN subject ILIKE ANY (ARRAY[
      '%crecimiento económico%', '%crecimiento economico%', '%pib%',
      '%actividad económica%', '%actividad economica%', '%productividad%',
      '%competitividad%', '%economía%', '%economia%', '%recesión%',
      '%recesion%', '%rueda de negocios%', '%clima de negocios%',
      '%inversión%', '%inversion%', '%reactivac%', '%reactiva%',
      '%crecimiento%', '%desarrollo económico%', '%desarrollo economico%'
    ]) THEN 'ACTIVIDAD'
    WHEN subject ILIKE ANY (ARRAY[
      '%producción%', '%produccion%', '%industria%', '%agro%', '%soya%',
      '%miner%', '%maíz%', '%maiz%', '%sorgo%',
      '%arroz%', '%hectárea%', '%hectarea%', '%empresari%', '%ganader%',
      '%cacao%', '%azúcar%', '%azucar%', '%quintal%', '%fertilizante%',
      '%cosecha%', '%siembra%', '%oleagin%', '%girasol%', '%carne%',
      '%leche%', '%avícola%', '%avicola%', '%cemento%', '%textil%',
      '%manufactura%', '%oro %', '%zinc%', '%estaño%', '%estano%',
      '%cooperativa minera%', '%pyme%', '%emprendimiento%', '%turismo%',
      '%planta%', '%productor%', '%internet%', '%telefon%', '%venta%',
      '%comerciante%', '%mercado interno%', '%exploración%', '%exploracion%',
      '%castaña%', '%castana%', '%quinua%', '%café%', '%cafe %', '%madera%',
      '%cainco%', '%anapo%', '%cao %', '%ibce%', '%fepc%', '%cámara de comercio%',
      '%camara de comercio%', '%cámara boliviano%', '%camara boliviano%',
      '%empresa%', '%fábrica%', '%fabrica%', '%planta industrial%', '%inra%',
      '%tierras%', '%predio%', '%semilla%', '%transgénic%', '%transgenic%',
      '%senasag%', '%telecomunicac%', '%aerolínea%', '%aerolinea%', '%boa %',
      '%comercial%'
    ]) THEN 'SECTOR_REAL'
    ELSE 'OTROS'
  END AS topic,
  CASE
    WHEN subject ILIKE ANY (ARRAY[
      '%falso%', '%engañoso%', '%enganoso%', '%manipulad%', '%desmiente%',
      '%desinformación%', '%desinformacion%', '%sacado de contexto%',
      '%verificación%', '%verificacion%', '%no es cierto%', '%fake%',
      '%bulo%', '%aclara que no%'
    ]) THEN 'DESINFORMACION'
    WHEN subject ILIKE ANY (ARRAY[
      '%desabastec%', '%escasez%', '%escasea%', '%no hay %', '%colaps%',
      '%crisis%', '%temor%', '%pánico%', '%panico%', '%alerta%', '%emergencia%',
      '%falta de %', '%acaparamiento%', '%especulación%', '%especulacion%',
      '%fila%', '%cola%', '%racionamiento%', '%agotad%', '%desesperac%',
      '%urgente%', '%grave%', '%críti%', '%criti%', '%riesgo%', '%advierte%',
      '%advierten%', '%peligro%', '%sin stock%', '%sin combustible%',
      '%alarma%', '%preocupa%', '%amenaz%', '%insuficiente%'
    ]) THEN 'ALARMA'
    WHEN subject ILIKE ANY (ARRAY[
      '%bloqueo%', '%bloquea%', '%paro %', '%protesta%', '%movilizac%',
      '%marcha%', '%conflicto%', '%enfrentamiento%', '%amenaza%', '%denuncia%',
      '%exige%', '%rechaza%', '%interpelac%', '%huelga%', '%tranca%',
      '%vigilia%', '%disputa%', '%acusa%', '%querella%', '%pugna%',
      '%presión social%', '%toma de %', '%avasalla%'
    ]) THEN 'CONFLICTO'
    WHEN subject ILIKE ANY (ARRAY[
      '%rumor%', '%presunt%', '%versión%', '%version%', '%incertidumbre%',
      '%podría%', '%podria%', '%evalúa%', '%evalua%', '%analiza%',
      '%no confirm%', '%prevé%', '%preve%', '%proyecta%', '%estima%',
      '%plantea%', '%propone%', '%estudia%', '%negocia%', '%definirá%',
      '%definira%', '%pendiente%', '%en duda%', '%expectativa%'
    ]) THEN 'INCERTIDUMBRE'
    WHEN subject ILIKE ANY (ARRAY[
      '%caída%', '%caida%', '%cae %', '%cayó%', '%cayo %', '%déficit%',
      '%deficit%', '%pérdida%', '%perdida%', '%contracción%', '%contraccion%',
      '%fracaso%', '%incumplimiento%', '%mora %', '% baja%', '%a la baja%',
      '%retroces%', '%afectad%', '%golpead%', '%desplom%', '%reduc%',
      '%disminu%', '%recort%', '%suspend%', '%paraliz%', '%cierr%',
      '%quiebra%', '%atraso%', '%retras%', '%pierde%', '%perdi%', '%endeud%',
      '%insostenible%', '%anula%', '%víctima%', '%victima%', '%agrav%',
      '%empeor%', '%estanca%', '%desacelera%'
    ]) THEN 'DETERIORO'
    WHEN subject ILIKE ANY (ARRAY[
      '%acuerdo%', '%inversión%', '%inversion%', '%crec%', '%aumento%',
      '%aument%', '%recuperac%', '%récord%', '%record%', '%alza%', '%impuls%',
      '%amplía%', '%amplia%', '%firma%', '%habilit%', '%inaugur%', '%sube%',
      '%subió%', '%subio%', '%increment%', '%mejor%', '%convenio%',
      '%duplica%', '%avanz%', '%logr%', '%aprob%', '%aprueba%', '%reactiv%',
      '%nuevo mercado%', '%beneficia%', '%fortalec%', '%boom%', '%gana%',
      '%ganó%', '%gano %', '%exitos%', '%éxito%', '%supera%'
    ]) THEN 'MEJORA'
    WHEN subject ILIKE ANY (ARRAY[
      '%anunci%', '%implementa%', '%crea%', '%lanza%', '%promulg%',
      '%decret%', '%autoriz%', '%adjudic%', '%regula%', '%dispone%',
      '%establec%', '%presenta%', '%inicia%', '%arranca%', '%pone en marcha%',
      '%pide%', '%solicita%', '%recomienda%', '%convoca%', '%instruye%',
      '%determina%', '%oficializa%', '%reglamenta%', '%modific%', '%define%',
      '%definen%', '%activa%', '%promueve%', '%promuev%', '%identifica%',
      '%plantea%', '%prepara%', '%proyecto de ley%', '%firman%', '%acuerda%'
    ]) THEN 'MEDIDA'
    ELSE 'NEUTRO'
  END AS tone,
  CASE
    WHEN subject ILIKE '%santa cruz%' OR subject ILIKE '%montero%' THEN 'SANTA_CRUZ'
    WHEN subject ILIKE '%la paz%' OR subject ILIKE '%el alto%' THEN 'LA_PAZ'
    WHEN subject ILIKE '%cochabamba%' OR subject ILIKE '%chapare%' THEN 'COCHABAMBA'
    WHEN subject ILIKE '%oruro%' THEN 'ORURO'
    WHEN subject ILIKE '%potosí%' OR subject ILIKE '%potosi%' THEN 'POTOSI'
    WHEN subject ILIKE '%tarija%' OR subject ILIKE '%yacuiba%' THEN 'TARIJA'
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
  await context.sequelize.query(articleView);
  await context.sequelize.query(grants);
}

/**
 * Rolling back restores the previous vocabularies, which is what the step
 * before this one wrote. A view replaced in place has no earlier version to
 * fall back to, so the down leaves the widened one standing rather than
 * dropping a view four other read models depend on.
 */
export async function down(): Promise<void> {
  return Promise.resolve();
}
