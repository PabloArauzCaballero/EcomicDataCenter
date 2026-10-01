import { watchlist } from './0078-widen-the-watchlist-again.vocabulary';
import { articleView } from './0071-widen-the-coverage-lexicon.view';

/**
 * Las dos lecturas de una nota de prensa, como funciones, y las vistas que las usan.
 *
 * Hasta la 0091 la vista `press_article` volvia a clasificar CADA nota del archivo
 * en cada refresco: tres cascadas de expresiones regulares (tema, tono, region)
 * sobre mas de 40.000 notas, ~120 ms por nota, y `press_term_mention` otra vez lo
 * mismo contra el vocabulario de temas. Cada despliegue de Contabo pagaba mas de
 * dos horas para mirar las mismas notas de siempre, y un refresco cancelado por
 * el tope de sentencia dejaba la prensa vieja hasta el despliegue siguiente.
 *
 * Una nota publicada no cambia: lo unico que cambia su clasificacion es el
 * LEXICO. Por eso la clasificacion se calcula una vez por nota y se guarda
 * (`press_claim_reading`, `press_claim_term`), y un refresco solo paga las notas
 * nuevas. El lexico y el vocabulario salen de las MISMAS cadenas de la 0071 y la
 * 0078 — no hay una copia a mano que pueda diferir de lo que mostraba el tablero.
 *
 * La huella (`digest`) de cada funcion es el md5 de su codigo. Cambiar el lexico es
 * `CREATE OR REPLACE FUNCTION`, la huella cambia, las filas guardadas dejan de
 * valer y la siguiente reconstruccion las rehace. Nada que recordar a mano.
 *
 * Mientras una nota no tenga lectura guardada, la vista la calcula al vuelo con la
 * misma funcion: una base recien migrada, o la de integracion continua, responde
 * igual que antes, solo que sin el atajo.
 */

/** Los tres CASE (tema, tono, region) tal como los escribio la 0071, sobre `subject`. */
function classificationCases(): string {
  const marker = 'published.*,';
  const first = articleView.indexOf(marker);
  const endMarker = 'END AS region';
  const last = articleView.indexOf(endMarker);
  if (first === -1 || last === -1 || last < first) {
    throw new Error('La vista de la 0071 ya no tiene la forma que la 0092 espera');
  }
  return articleView.slice(first + marker.length, last + endMarker.length);
}

export const functions = `
CREATE OR REPLACE FUNCTION read_models.press_classify(subject text)
RETURNS TABLE (topic text, tone text, region text)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $classify$
  SELECT
${classificationCases()}
$classify$;

CREATE OR REPLACE FUNCTION read_models.press_term_hits(searchable text)
RETURNS TABLE (term text, label text, family text)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $hits$
  SELECT vocabulary.term, vocabulary.label, vocabulary.family
  FROM (
    VALUES
${watchlist}
  ) AS vocabulary (term, label, family, pattern)
  WHERE searchable ~ ANY (vocabulary.pattern)
$hits$;

-- La huella de cada lexico: cambia exactamente cuando cambia su codigo.
CREATE OR REPLACE FUNCTION read_models.press_class_digest()
RETURNS text
LANGUAGE sql
STABLE
AS $digest$
  SELECT md5(prosrc) FROM pg_catalog.pg_proc
  WHERE oid = 'read_models.press_classify(text)'::regprocedure
$digest$;

CREATE OR REPLACE FUNCTION read_models.press_term_digest()
RETURNS text
LANGUAGE sql
STABLE
AS $digest$
  SELECT md5(prosrc) FROM pg_catalog.pg_proc
  WHERE oid = 'read_models.press_term_hits(text)'::regprocedure
$digest$;
`;

/**
 * `press_article`, con la lectura guardada si existe y la calculada si no.
 *
 * El `published` es el de la 0071 sin tocar: se parte la cadena en el `SELECT`
 * final, de modo que la parte que arma las notas sea la misma bit a bit.
 */
export function articleReadingView(): string {
  const head = articleView.slice(0, articleView.indexOf('SELECT\n  published.*,'));
  return `${head}SELECT
  published.*,
  COALESCE(stored.topic, fresh.topic)   AS topic,
  COALESCE(stored.tone, fresh.tone)     AS tone,
  COALESCE(stored.region, fresh.region) AS region
FROM published
LEFT JOIN intelligence.press_claim_reading AS stored
  ON stored.fact_claim_id = published.fact_claim_id
 AND stored.class_digest = (SELECT read_models.press_class_digest())
LEFT JOIN LATERAL (
  SELECT classified.topic, classified.tone, classified.region
  FROM read_models.press_classify(
    translate(
      lower(coalesce(published.headline, '') || ' ' || coalesce(published.summary, '')),
      'áéíóúüñÁÉÍÓÚÜÑ',
      'aeiouunaeiouun'
    )
  ) AS classified
  WHERE stored.fact_claim_id IS NULL
) AS fresh ON true;
`;
}

/** `press_term_mention`, con la misma regla: lo guardado si vale, lo calculado si no. */
export const termReadingView = `
CREATE OR REPLACE VIEW read_models.press_term_mention AS
WITH article AS MATERIALIZED (
  SELECT
    fact_claim_id,
    event_date,
    outlet,
    topic,
    tone,
    region,
    translate(
      lower(coalesce(headline, '') || ' ' || coalesce(summary, '')),
      'áéíóúüñ',
      'aeiouun'
    ) AS searchable
  FROM read_models.press_article_snapshot
  WHERE status = 'PUBLISHED' AND NOT superseded
)
SELECT
  hit.term,
  hit.label,
  hit.family,
  article.fact_claim_id,
  article.event_date,
  article.outlet,
  article.topic,
  article.tone,
  article.region
FROM article
LEFT JOIN intelligence.press_claim_reading AS stored
  ON stored.fact_claim_id = article.fact_claim_id
 AND stored.term_digest = (SELECT read_models.press_term_digest())
CROSS JOIN LATERAL (
  SELECT kept.term, kept.label, kept.family
  FROM intelligence.press_claim_term AS kept
  WHERE stored.fact_claim_id IS NOT NULL
    AND kept.fact_claim_id = article.fact_claim_id
  UNION ALL
  SELECT found.term, found.label, found.family
  FROM read_models.press_term_hits(article.searchable) AS found
  WHERE stored.fact_claim_id IS NULL
) AS hit;
`;

/**
 * Guarda la lectura de las notas que aun no la tienen, por lotes.
 *
 * Por lotes y no de una vez: la primera reconstruccion tras esta migracion lee
 * todo el archivo, y una sola sentencia de dos horas es justo lo que el tope de
 * sentencia cancela. Cada llamada hace como mucho `batch_size` notas; quien la
 * llama repite hasta que devuelve 0, y lo ya
 * guardado se conserva aunque la siguiente vuelta se corte. Devuelve cuantas
 * notas leyo en esta vuelta.
 *
 * `SECURITY DEFINER`, igual que `refresh_snapshot`: el escritor no es dueno de
 * `read_models` y no debe serlo. La funcion solo escribe las dos tablas de
 * lecturas y solo lee las notas de prensa.
 */
export const fillFunction = `
CREATE OR REPLACE FUNCTION read_models.fill_press_readings(batch_size integer)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fill$
DECLARE
  class_now text := read_models.press_class_digest();
  term_now text := read_models.press_term_digest();
  filled bigint;
BEGIN
  IF batch_size IS NULL OR batch_size < 1 THEN
    RAISE EXCEPTION 'El tamano del lote debe ser positivo';
  END IF;

  DROP TABLE IF EXISTS pg_temp.pending_press_note;
  CREATE TEMP TABLE pending_press_note ON COMMIT DROP AS
  SELECT
    claim.fact_claim_id,
    translate(
      lower(coalesce(observation.payload_json ->> 'headline', '') || ' '
        || coalesce(observation.payload_json ->> 'summary', '')),
      'áéíóúüñÁÉÍÓÚÜÑ',
      'aeiouunaeiouun'
    ) AS subject,
    translate(
      lower(coalesce(observation.payload_json ->> 'headline', '') || ' '
        || coalesce(observation.payload_json ->> 'summary', '')),
      'áéíóúüñ',
      'aeiouun'
    ) AS searchable
  FROM intelligence.fact_claim AS claim
  JOIN intelligence.raw_observation AS observation
    ON observation.raw_observation_id = claim.raw_observation_id
  WHERE observation.payload_json ->> 'dataCategory' = 'PRESS_COVERAGE'
    AND observation.payload_json ->> 'headline' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM intelligence.press_claim_reading AS stored
      WHERE stored.fact_claim_id = claim.fact_claim_id
        AND stored.class_digest = class_now
        AND stored.term_digest = term_now
    )
  LIMIT batch_size;

  GET DIAGNOSTICS filled = ROW_COUNT;

  DELETE FROM intelligence.press_claim_term AS old
  USING pg_temp.pending_press_note AS note
  WHERE old.fact_claim_id = note.fact_claim_id;

  INSERT INTO intelligence.press_claim_term (fact_claim_id, term, label, family)
  SELECT note.fact_claim_id, hit.term, hit.label, hit.family
  FROM pg_temp.pending_press_note AS note
  CROSS JOIN LATERAL read_models.press_term_hits(note.searchable) AS hit;

  INSERT INTO intelligence.press_claim_reading
    (fact_claim_id, class_digest, term_digest, topic, tone, region, read_at)
  SELECT note.fact_claim_id, class_now, term_now,
         classified.topic, classified.tone, classified.region, now()
  FROM pg_temp.pending_press_note AS note
  CROSS JOIN LATERAL read_models.press_classify(note.subject) AS classified
  ON CONFLICT (fact_claim_id) DO UPDATE
    SET class_digest = EXCLUDED.class_digest,
        term_digest = EXCLUDED.term_digest,
        topic = EXCLUDED.topic,
        tone = EXCLUDED.tone,
        region = EXCLUDED.region,
        read_at = EXCLUDED.read_at;

  DROP TABLE pg_temp.pending_press_note;
  RETURN filled;
END;
$fill$;

REVOKE ALL ON FUNCTION read_models.fill_press_readings(integer) FROM PUBLIC;
`;
