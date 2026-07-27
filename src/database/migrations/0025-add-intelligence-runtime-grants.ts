import type { MigrationContext } from '../migration.types';

/**
 * Applies least privilege to the intelligence and audit schemas.
 *
 * The writer never receives DELETE on the raw landing zone and never receives
 * UPDATE or DELETE on the audit trail, so privilege and trigger reinforce the
 * same rule. The reader receives SELECT only on the curated tables.
 */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
REVOKE ALL ON SCHEMA intelligence, audit FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA intelligence, audit FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA intelligence, audit REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_writer') THEN
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA intelligence, audit FROM backend_writer;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA intelligence, audit FROM backend_writer;
    REVOKE CREATE ON SCHEMA intelligence, audit FROM backend_writer;

    GRANT USAGE ON SCHEMA intelligence, audit TO backend_writer;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      intelligence.ai_agent,
      intelligence.agent_run,
      intelligence.economic_entity,
      intelligence.entity_alias,
      intelligence.fact_claim,
      intelligence.claim_evidence,
      intelligence.entity_mention,
      intelligence.data_contradiction,
      intelligence.review_task
      TO backend_writer;
    GRANT SELECT, INSERT, UPDATE ON TABLE intelligence.raw_observation TO backend_writer;
    GRANT SELECT, INSERT ON TABLE audit.audit_log TO backend_writer;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA intelligence, audit TO backend_writer;
    GRANT EXECUTE ON FUNCTION
      intelligence.reject_raw_observation_payload_mutation(),
      intelligence.assert_claim_has_evidence(uuid),
      intelligence.enforce_claim_has_evidence(),
      audit.reject_audit_log_mutation()
      TO backend_writer;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_reader') THEN
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA intelligence, audit FROM backend_reader;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA intelligence, audit FROM backend_reader;
    REVOKE CREATE ON SCHEMA intelligence, audit FROM backend_reader;

    GRANT USAGE ON SCHEMA intelligence, audit TO backend_reader;
    GRANT SELECT ON TABLE
      intelligence.ai_agent,
      intelligence.agent_run,
      intelligence.economic_entity,
      intelligence.entity_alias,
      intelligence.fact_claim,
      intelligence.claim_evidence,
      intelligence.entity_mention,
      intelligence.data_contradiction,
      intelligence.review_task,
      audit.audit_log
      TO backend_reader;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
    GRANT USAGE ON SCHEMA intelligence, audit TO backup_operator;
    GRANT SELECT ON ALL TABLES IN SCHEMA intelligence, audit TO backup_operator;
  END IF;
END;
$$;
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA intelligence, audit FROM backup_operator;
    REVOKE USAGE ON SCHEMA intelligence, audit FROM backup_operator;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_reader') THEN
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA intelligence, audit FROM backend_reader;
    REVOKE USAGE ON SCHEMA intelligence, audit FROM backend_reader;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_writer') THEN
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA intelligence, audit FROM backend_writer;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA intelligence, audit FROM backend_writer;
    REVOKE USAGE ON SCHEMA intelligence, audit FROM backend_writer;
  END IF;
END;
$$;
  `);
}
