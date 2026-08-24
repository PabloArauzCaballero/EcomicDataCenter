import type { MigrationContext } from '../migration.types';

/**
 * Reporting model for material events filed with the exchange.
 *
 * Filings are not readings: they have no value, no unit and no series, so they
 * belong beside the indicator models rather than inside them. What a reader
 * needs from one is who filed it, what it says, when it was stamped and where
 * to go and read it in full — and the digest of the page that was read, so the
 * record can be checked against the source rather than trusted.
 *
 * Idempotent like the models before it: dropped before being recreated.
 */

const dropView = `DROP VIEW IF EXISTS read_models.company_filing;`;

const filingView = `
CREATE VIEW read_models.company_filing AS
SELECT
  fc.fact_claim_id,
  ro.raw_observation_id,
  fc.event_date,
  fc.published_at,
  ro.received_at,
  ro.payload_json ->> 'filer'                        AS filer,
  ro.payload_json ->> 'subject'                      AS subject,
  ro.payload_json ->> 'statedInstant'                AS stated_instant,
  (ro.payload_json ->> 'publicationInDocument')::boolean AS instant_stated_in_document,
  ro.payload_json ->> 'publisher'                    AS publisher,
  (ro.payload_json ->> 'publisherVerified')::boolean AS publisher_verified,
  ro.payload_json ->> 'url'                          AS source_url,
  ro.payload_json ->> 'sha256'                       AS evidence_sha256,
  fc.confidence_level,
  fc.impact_level,
  fc.status,
  (fc.superseded_by_claim_id IS NOT NULL)            AS superseded,
  fc.assertion,
  evidence.excerpt
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
WHERE ro.payload_json ->> 'dataCategory' = 'COMPANY_NEWS'
  AND ro.payload_json ->> 'subject' IS NOT NULL;
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
