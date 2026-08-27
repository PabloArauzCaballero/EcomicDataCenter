import type { MigrationContext } from '../migration.types';

/**
 * Serves the yield curve the exchange closes each session with.
 *
 * Until now the observatory could answer what a dollar cost and what the
 * economy produced, but not what the country's own debt pays — the single
 * question anyone asking about sovereign bonds actually means. The annual flow
 * figure it did hold is a balance-of-payments aggregate, not a price.
 *
 * The curve gets its own model rather than a place among the measured
 * indicators, and the reason is arithmetic rather than taste. A yield only
 * means something together with the instrument, the issuer, the currency, the
 * side of the market and the maturity band; `economic_indicator_daily` groups
 * by indicator and side alone, so a yield admitted there would be folded with
 * every other yield of its day into one median standing for the Treasury at
 * three years and a bank deposit at thirty days at once. Nobody quoted that
 * number. So the payloads carry no `measures` key, which is what keeps them out
 * of that view, and land here instead with their dimensions intact.
 *
 * `is_sovereign` is computed rather than collected: the Tesoro General de la
 * Nación issues the debt and the Banco Central issues the regulation paper the
 * short end is priced off. Both are the state borrowing, and a reader asking
 * for sovereign yields means both — while the banks and corporates quoting
 * beside them are what make the sovereign number readable, so they stay.
 *
 * Idempotent like the models before it: dropped before being recreated.
 */

const dropView = `DROP VIEW IF EXISTS read_models.sovereign_yield_curve;`;

const curveView = `
CREATE VIEW read_models.sovereign_yield_curve AS
SELECT
  fc.fact_claim_id,
  ro.raw_observation_id,
  fc.agent_run_id,
  fc.event_date,
  ro.payload_json ->> 'venue'                        AS venue,
  ro.payload_json ->> 'currency'                     AS currency,
  ro.payload_json ->> 'operation'                    AS operation,
  ro.payload_json ->> 'segment'                      AS segment,
  ro.payload_json ->> 'instrument'                   AS instrument,
  NULLIF(ro.payload_json ->> 'issuer', '')           AS issuer,
  (ro.payload_json ->> 'issuer') IN ('TGN', 'BCB')   AS is_sovereign,
  ro.payload_json ->> 'tenorBucket'                  AS tenor_bucket,
  -- The band is headed "1081-Más" at the long end, so the lower bound is what
  -- orders the curve: it is the only bound every band actually states.
  NULLIF(split_part(ro.payload_json ->> 'tenorBucket', '-', 1), '')::integer AS tenor_days_from,
  (ro.payload_json ->> 'yieldPercent')::numeric      AS yield_percent,
  ro.payload_json ->> 'statedValue'                  AS stated_value,
  ro.payload_json ->> 'publisher'                    AS publisher,
  (ro.payload_json ->> 'publisherVerified')::boolean AS publisher_verified,
  ro.payload_json ->> 'url'                          AS source_url,
  ce.excerpt                                         AS evidence_excerpt,
  sa.sha256                                          AS evidence_sha256,
  fc.status,
  (fc.superseded_by_claim_id IS NOT NULL)            AS superseded,
  fc.assertion
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN intelligence.claim_evidence ce
  ON ce.fact_claim_id = fc.fact_claim_id
LEFT JOIN provenance.source_artifact sa
  ON sa.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'recordType' = 'YIELD_CURVE_POINT'
  AND ro.payload_json ->> 'yieldPercent' ~ '^[0-9]+([.][0-9]+)?$';
`;

const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.sovereign_yield_curve TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropView);
  await context.sequelize.query(curveView);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropView);
}
