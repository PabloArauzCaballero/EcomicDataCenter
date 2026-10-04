/**
 * Las cuentas oficiales de las empresas en redes sociales, abiertas para leer
 * (ADR 0027).
 *
 * Tres vistas sobre las observaciones que escribe el cargador `company-social`,
 * con el patrón de la migración 0089: se leen de `intelligence.raw_observation`
 * por su propio `dataCategory`, unidas a la afirmación publicada y al artefacto
 * que guarda la huella.
 *
 * - `company_social_profile`: una fila por empresa, red y día de captura. Si un
 *   día se leyó dos veces, queda la última lectura.
 * - `company_social_post`: cada post en su lectura más reciente; las cifras de
 *   un post crecen de una semana a otra y lo que interesa es la última.
 * - `company_social_term`: los términos de la última corrida de cada empresa
 *   y ámbito.
 */

const published = `
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id`;

const live = `
  AND fc.status = 'PUBLISHED'
  AND fc.superseded_by_claim_id IS NULL`;

export const dropCompanySocialViews = `
DROP VIEW IF EXISTS read_models.company_social_term;
DROP VIEW IF EXISTS read_models.company_social_post;
DROP VIEW IF EXISTS read_models.company_social_profile;
`;

export const companySocialProfileView = `
CREATE VIEW read_models.company_social_profile AS
SELECT DISTINCT ON (ro.payload_json ->> 'slug', ro.payload_json ->> 'platform', ro.payload_json ->> 'date')
  ro.payload_json ->> 'slug'                       AS slug,
  ro.payload_json ->> 'platform'                   AS platform,
  (ro.payload_json ->> 'date')::date               AS reading_date,
  ro.payload_json ->> 'runId'                      AS run_id,
  ro.payload_json ->> 'url'                        AS account_url,
  ro.payload_json ->> 'handle'                     AS handle,
  ro.payload_json ->> 'status'                     AS read_status,
  ro.payload_json ->> 'statusNote'                 AS status_note,
  ro.payload_json ->> 'displayName'                AS display_name,
  (ro.payload_json ->> 'followers')::bigint        AS followers,
  (ro.payload_json ->> 'following')::bigint        AS following,
  (ro.payload_json ->> 'postCount')::bigint        AS post_count,
  (ro.payload_json ->> 'likesTotal')::bigint       AS likes_total,
  (ro.payload_json ->> 'talkingAbout')::bigint     AS talking_about,
  (ro.payload_json ->> 'postsRead')::integer       AS posts_read,
  (ro.payload_json ->> 'postsInWindow')::integer   AS posts_in_window,
  (ro.payload_json ->> 'postsPerWeek')::numeric    AS posts_per_week,
  (ro.payload_json ->> 'engagementPct')::numeric   AS engagement_pct,
  (ro.payload_json ->> 'commentsRead')::integer    AS comments_read,
  ro.payload_json -> 'commentSentiment'            AS comment_sentiment,
  (ro.payload_json ->> 'retrievedAt')::timestamptz AS retrieved_at,
  artifact.sha256                                  AS evidence_sha256
${published}
WHERE ro.payload_json ->> 'dataCategory' = 'COMPANY_SOCIAL_PROFILE'
${live}
ORDER BY
  ro.payload_json ->> 'slug',
  ro.payload_json ->> 'platform',
  ro.payload_json ->> 'date',
  ro.received_at DESC,
  ro.raw_observation_id DESC;
`;

export const companySocialPostView = `
CREATE OR REPLACE VIEW read_models.company_social_post AS
SELECT DISTINCT ON (post ->> 'slug', post ->> 'platform', post ->> 'postId')
  post ->> 'slug'                          AS slug,
  post ->> 'platform'                      AS platform,
  post ->> 'postId'                        AS post_id,
  post ->> 'url'                           AS post_url,
  (post ->> 'publishedAt')::date           AS published_at,
  (ro.payload_json ->> 'date')::date       AS reading_date,
  (post ->> 'likes')::bigint               AS likes,
  (post ->> 'comments')::bigint            AS comments,
  (post ->> 'shares')::bigint              AS shares,
  (post ->> 'views')::bigint               AS views,
  (post ->> 'interactions')::bigint        AS interactions,
  post ->> 'discovery'                     AS discovery,
  post ->> 'format'                        AS post_format,
  (post ->> 'publishedHour')::integer      AS published_hour,
  post ->> 'text'                          AS post_text,
  post ->> 'captionPolarity'               AS caption_polarity,
  post -> 'commentSentiment'               AS comment_sentiment
${published}
CROSS JOIN LATERAL jsonb_array_elements(ro.payload_json -> 'posts') AS post
WHERE ro.payload_json ->> 'dataCategory' = 'COMPANY_SOCIAL_POSTS'
${live}
ORDER BY
  post ->> 'slug',
  post ->> 'platform',
  post ->> 'postId',
  ro.payload_json ->> 'date' DESC,
  ro.received_at DESC;
`;

export const companySocialTermView = `
CREATE VIEW read_models.company_social_term AS
WITH latest AS (
  SELECT DISTINCT ON (ro.payload_json ->> 'slug', ro.payload_json ->> 'scope')
    ro.payload_json
  ${published}
  WHERE ro.payload_json ->> 'dataCategory' = 'COMPANY_SOCIAL_TERMS'
  ${live}
  ORDER BY
    ro.payload_json ->> 'slug',
    ro.payload_json ->> 'scope',
    ro.payload_json ->> 'date' DESC,
    ro.received_at DESC
)
SELECT
  latest.payload_json ->> 'slug'           AS slug,
  latest.payload_json ->> 'scope'          AS scope,
  (latest.payload_json ->> 'date')::date   AS reading_date,
  (latest.payload_json ->> 'texts')::integer AS texts,
  item ->> 'kind'                          AS kind,
  item ->> 'term'                          AS term,
  (item ->> 'count')::integer              AS mentions,
  (item ->> 'rank')::integer               AS term_rank
FROM latest
CROSS JOIN LATERAL jsonb_array_elements(latest.payload_json -> 'terms') AS item;
`;

export const companySocialIndex = `
CREATE INDEX IF NOT EXISTS ix_raw_observation_company_social
  ON intelligence.raw_observation ((payload_json ->> 'dataCategory'))
  WHERE payload_json ->> 'dataCategory' IN
    ('COMPANY_SOCIAL_PROFILE', 'COMPANY_SOCIAL_POSTS', 'COMPANY_SOCIAL_TERMS');
`;

export const grants = `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY['company_social_profile', 'company_social_post', 'company_social_term'] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;
