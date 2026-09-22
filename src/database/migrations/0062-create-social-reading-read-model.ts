import type { MigrationContext } from '../migration.types';

/**
 * Reporting model for what third parties published about Bolivia's social
 * platforms.
 *
 * Kept apart from every indicator model, and further apart than press is. An
 * article at least reports a measurement somebody made; a platform's declared
 * audience is a commercial ceiling, and a monitoring sample is one month of one
 * conflict. Nothing here can reach a series: this view reads only
 * SOCIAL_READING observations, and the checks that admit a figure into a series
 * admit only OFFICIAL publishers.
 *
 * Two things are derived here rather than stored, for the same reason the press
 * topic is: a derivation that lives in one visible expression can be argued
 * with and corrected, where a label baked in at capture time cannot.
 *
 * `emotional_register` has four values and not three polarities. In the May
 * 2026 conflict monitoring, posts about the dead drew "haha" more than any
 * other reaction — mockery marks which side you are on, not amusement, and a
 * polarity classifier would score it as positive affect. So BURLA is named,
 * beside MIEDO, INDIGNACION and RESIGNACION.
 *
 * `official_counterpart` names the measured series a reading can be set
 * against. That comparison is the point of the whole register: in 2025 the
 * networks predicted imminent hyperinflation while the year closed at 20.8%,
 * and the distance between the two is the signal — never the social level on
 * its own.
 *
 * See docs/decisions/0022-social-readings-never-measure.md.
 */

const dropViews = `
DROP MATERIALIZED VIEW IF EXISTS read_models.social_reading_snapshot;
DROP VIEW IF EXISTS read_models.social_platform_audience;
DROP VIEW IF EXISTS read_models.social_reading;
`;

const readingView = `
CREATE VIEW read_models.social_reading AS
WITH published AS (
  SELECT
    fc.fact_claim_id,
    ro.raw_observation_id,
    fc.event_date,
    fc.published_at,
    ro.received_at,
    ro.payload_json ->> 'platform'             AS platform,
    ro.payload_json ->> 'subject'              AS subject,
    ro.payload_json ->> 'metric'               AS metric,
    ro.payload_json ->> 'label'                AS label,
    (ro.payload_json ->> 'value')::numeric     AS value,
    ro.payload_json ->> 'unit'                 AS unit,
    ro.payload_json ->> 'referencePeriod'      AS reference_period,
    ro.payload_json ->> 'publisher'            AS publisher,
    ro.payload_json ->> 'domain'               AS publisher_domain,
    ro.payload_json ->> 'publication'          AS publication,
    ro.payload_json ->> 'publicationPrecision' AS publication_precision,
    ro.payload_json ->> 'method'               AS method,
    ro.payload_json ->> 'evidenceGrade'        AS evidence_grade,
    ro.payload_json ->> 'url'                  AS reading_url,
    artifact.sha256                            AS record_sha256,
    fc.confidence_level,
    fc.status,
    (fc.superseded_by_claim_id IS NOT NULL) AS superseded,
    fc.assertion,
    evidence.excerpt AS statement
  FROM intelligence.fact_claim fc
  JOIN intelligence.raw_observation ro
    ON ro.raw_observation_id = fc.raw_observation_id
  LEFT JOIN provenance.source_artifact artifact
    ON artifact.source_artifact_id = ro.source_artifact_id
  LEFT JOIN LATERAL (
    SELECT ce.excerpt
    FROM intelligence.claim_evidence ce
    WHERE ce.fact_claim_id = fc.fact_claim_id
    ORDER BY ce.claim_evidence_id
    LIMIT 1
  ) AS evidence ON true
  WHERE ro.payload_json ->> 'dataCategory' = 'SOCIAL_READING'
    AND ro.payload_json ->> 'metric' IS NOT NULL
)
SELECT
  published.*,
  -- The register is read from what the reading is *called*, never from the
  -- prose about it. "Publicaciones que apelaban al odio" is a reading about
  -- hate whose statement explains that fear was the instrument; matching on the
  -- statement filed it under MIEDO, which inverted what it measures. A label is
  -- written once, deliberately, and is the right evidence for this.
  CASE
    WHEN named ~ ANY (ARRAY[
      '\\mmiedo', '\\mpanico', '\\mtemor', '\\mdesconfianza', '\\mespecula',
      '\\mrumor', '\\mincertidumbre', '\\mfraude', '\\mdesabastec'
    ]) THEN 'MIEDO'
    WHEN named ~ ANY (ARRAY[
      '\\modio', '\\menoja', '\\mindigna', '\\mrabia', '\\mdenuncia',
      '\\mhostig', '\\magres', '\\minsult'
    ]) THEN 'INDIGNACION'
    WHEN named ~ ANY (ARRAY[
      '\\mburla', '\\mdivierte', '\\mhaha', '\\mmeme', '\\mridicul',
      '\\msarcasm', '\\mironia', '\\mcomedia', '\\mhumor'
    ]) THEN 'BURLA'
    WHEN named ~ ANY (ARRAY[
      '\\mresigna', '\\mcansancio', '\\mhartazgo', '\\mdesanimo', '\\mapatia',
      '\\mabandono', '\\mtristeza', '\\mentristece'
    ]) THEN 'RESIGNACION'
    ELSE 'NINGUNO'
  END AS emotional_register,
  -- The counterpart reads the whole record instead. Which measured series a
  -- reading speaks to is often stated only in the body: the speculation reading
  -- is named for the intent and says in its statement that what was speculated
  -- about was currency flight.
  CASE
    WHEN narrated ~ ANY (ARRAY[
      '\\minflacion', '\\mprecio', '\\mcanasta', '\\mcarestia', '\\malimento'
    ]) THEN 'PRECIOS'
    WHEN narrated ~ ANY (ARRAY[
      '\\mdolar', '\\mtipo de cambio', '\\mdivisa', '\\mparalelo', '\\mdevaluac'
    ]) THEN 'CAMBIARIO'
    WHEN narrated ~ ANY (ARRAY[
      '\\mqr\\M', '\\mpago', '\\mbilletera', '\\mbancar', '\\mtransacc'
    ]) THEN 'PAGOS'
    WHEN narrated ~ ANY (ARRAY[
      '\\mcompra', '\\mventa', '\\mtienda', '\\mcomercio', '\\mhogares',
      '\\mconsumo', '\\mferia', '\\mmercado'
    ]) THEN 'CONSUMO'
    ELSE 'NINGUNO'
  END AS official_counterpart
FROM published,
  LATERAL (
    SELECT translate(
      lower(coalesce(label, '') || ' ' || coalesce(metric, '')),
      'áéíóúüñÁÉÍÓÚÜÑ',
      'aeiouunaeiouun'
    )
  ) AS named_terms(named),
  LATERAL (
    SELECT translate(
      lower(coalesce(label, '') || ' ' || coalesce(metric, '') || ' ' || coalesce(statement, '')),
      'áéíóúüñÁÉÍÓÚÜÑ',
      'aeiouunaeiouun'
    )
  ) AS narrated_terms(narrated);
`;

/**
 * The audience readings, with the correction a reader must apply to them.
 *
 * A platform's declared reach is a commercial ceiling, not penetration, and the
 * ceiling worth measuring it against is the number of people who use the
 * internet — nobody is reachable on a platform without it. For Bolivia that is
 * 9.00 million against TikTok's declared 9.43 million, so the platform claims
 * more reachable adults than the country has people online.
 *
 * Total population is the wrong divisor and would hide exactly this case:
 * TikTok's figure sits below the 12.6 million inhabitants and only exceeds the
 * *adult* population, which no platform publishes a matching count for. Both
 * references are exposed so a reader can see the arithmetic rather than trust
 * the flag.
 *
 * The flag is computed rather than annotated so a platform added tomorrow
 * inherits the check without anybody remembering to apply it.
 */
const audienceView = `
CREATE VIEW read_models.social_platform_audience AS
WITH reference AS (
  SELECT
    max(value) FILTER (WHERE metric = 'POPULATION_TOTAL') AS population,
    max(value) FILTER (WHERE metric = 'INTERNET_USERS')   AS internet_users
  FROM read_models.social_reading
)
SELECT
  reading.platform,
  reading.metric,
  reading.label,
  reading.value,
  reading.unit,
  reading.reference_period,
  reading.event_date,
  reading.publisher,
  reading.evidence_grade,
  reading.reading_url,
  reference.population,
  reference.internet_users,
  CASE
    WHEN reading.unit IN ('PERSONS', 'ACCOUNTS')
     AND reference.internet_users IS NOT NULL
     AND reading.value > reference.internet_users
    THEN true
    ELSE false
  END AS reach_exceeds_internet_users
FROM read_models.social_reading AS reading
CROSS JOIN reference
WHERE reading.subject = 'AUDIENCE'
  AND reading.metric NOT IN ('POPULATION_TOTAL', 'INTERNET_USERS');
`;

const grants = `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY['social_reading', 'social_platform_audience'] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropViews);
  await context.sequelize.query(readingView);
  await context.sequelize.query(audienceView);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropViews);
}
