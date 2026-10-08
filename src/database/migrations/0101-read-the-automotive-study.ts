import type { MigrationContext } from '../migration.types';

/** Small indexed research snapshots; no materialised press/trade rebuild is required. */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
    CREATE INDEX IF NOT EXISTS ix_raw_observation_automotive_study
      ON intelligence.raw_observation ((payload_json ->> 'dataCategory'))
      WHERE payload_json ->> 'dataCategory' = 'AUTOMOTIVE_STUDY';
    CREATE VIEW read_models.automotive_study AS
      SELECT ro.payload_json -> 'study' AS study,
             (ro.payload_json -> 'study' ->> 'observedAt')::date AS observed_at,
             ro.received_at
      FROM intelligence.raw_observation ro
      WHERE ro.payload_json ->> 'dataCategory' = 'AUTOMOTIVE_STUDY'
        AND EXISTS (SELECT 1 FROM intelligence.fact_claim fc
          WHERE fc.raw_observation_id = ro.raw_observation_id AND fc.status = 'PUBLISHED'
            AND fc.superseded_by_claim_id IS NULL);
    CREATE VIEW read_models.automotive_study_current AS
      SELECT * FROM read_models.automotive_study ORDER BY observed_at DESC, received_at DESC LIMIT 1;
    CREATE VIEW read_models.automotive_dealer AS
      SELECT s.observed_at, row AS dealer FROM read_models.automotive_study_current s,
        LATERAL jsonb_array_elements(s.study -> 'dealers') row;
    CREATE VIEW read_models.automotive_offer AS
      SELECT s.observed_at, row AS offer FROM read_models.automotive_study_current s,
        LATERAL jsonb_array_elements(s.study -> 'offers') row;
    CREATE VIEW read_models.automotive_comparison AS
      SELECT s.observed_at, row AS comparison FROM read_models.automotive_study_current s,
        LATERAL jsonb_array_elements(s.study -> 'comparisons') row;
    CREATE VIEW read_models.automotive_market_metric AS
      SELECT s.observed_at, s.study -> 'fleet' AS fleet, s.study -> 'trade' AS trade
        FROM read_models.automotive_study_current s;
    DO $$ DECLARE role_name text; view_name text; BEGIN
      FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          FOREACH view_name IN ARRAY ARRAY['automotive_study', 'automotive_study_current', 'automotive_dealer', 'automotive_offer', 'automotive_comparison', 'automotive_market_metric'] LOOP
            EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
          END LOOP;
        END IF;
      END LOOP;
    END $$;
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
    DROP VIEW IF EXISTS read_models.automotive_market_metric;
    DROP VIEW IF EXISTS read_models.automotive_comparison;
    DROP VIEW IF EXISTS read_models.automotive_offer;
    DROP VIEW IF EXISTS read_models.automotive_dealer;
    DROP VIEW IF EXISTS read_models.automotive_study_current;
    DROP VIEW IF EXISTS read_models.automotive_study;
    DROP INDEX IF EXISTS intelligence.ix_raw_observation_automotive_study;
  `);
}
