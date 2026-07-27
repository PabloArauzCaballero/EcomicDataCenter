import type { MigrationContext } from '../migration.types';

/**
 * Enforces the three institutional rules that must not depend on application code.
 *
 * Raw payloads and audit entries are immutable, and a claim cannot reach
 * PUBLISHED without at least one stored evidence excerpt. Placing these in the
 * database means a defective service, a migration script or a manual session
 * cannot bypass them.
 */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE OR REPLACE FUNCTION intelligence.reject_raw_observation_payload_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'raw_observation payload is immutable; only processing_status and rejection_reason may change';
END;
$$;

CREATE TRIGGER trg_raw_observation_payload_immutable
BEFORE UPDATE OF payload_json, payload_hash, received_at, agent_run_id ON intelligence.raw_observation
FOR EACH ROW EXECUTE FUNCTION intelligence.reject_raw_observation_payload_mutation();

CREATE TRIGGER trg_raw_observation_delete_forbidden
BEFORE DELETE ON intelligence.raw_observation
FOR EACH ROW EXECUTE FUNCTION intelligence.reject_raw_observation_payload_mutation();

CREATE OR REPLACE FUNCTION audit.reject_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

CREATE TRIGGER trg_audit_log_append_only
BEFORE UPDATE OR DELETE ON audit.audit_log
FOR EACH ROW EXECUTE FUNCTION audit.reject_audit_log_mutation();

CREATE OR REPLACE FUNCTION intelligence.assert_claim_has_evidence(target_claim_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM intelligence.fact_claim
    WHERE fact_claim_id = target_claim_id AND status = 'PUBLISHED'
  ) AND NOT EXISTS (
    SELECT 1 FROM intelligence.claim_evidence
    WHERE fact_claim_id = target_claim_id
  ) THEN
    RAISE EXCEPTION 'A published claim must retain at least one evidence excerpt';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION intelligence.enforce_claim_has_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM intelligence.assert_claim_has_evidence(OLD.fact_claim_id);
  ELSE
    PERFORM intelligence.assert_claim_has_evidence(NEW.fact_claim_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_claim_requires_evidence
AFTER INSERT OR UPDATE ON intelligence.fact_claim
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION intelligence.enforce_claim_has_evidence();

CREATE CONSTRAINT TRIGGER trg_evidence_preserves_claim_evidence
AFTER INSERT OR UPDATE OR DELETE ON intelligence.claim_evidence
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION intelligence.enforce_claim_has_evidence();
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP TRIGGER IF EXISTS trg_evidence_preserves_claim_evidence ON intelligence.claim_evidence;
DROP TRIGGER IF EXISTS trg_claim_requires_evidence ON intelligence.fact_claim;
DROP FUNCTION IF EXISTS intelligence.enforce_claim_has_evidence();
DROP FUNCTION IF EXISTS intelligence.assert_claim_has_evidence(uuid);
DROP TRIGGER IF EXISTS trg_audit_log_append_only ON audit.audit_log;
DROP FUNCTION IF EXISTS audit.reject_audit_log_mutation();
DROP TRIGGER IF EXISTS trg_raw_observation_delete_forbidden ON intelligence.raw_observation;
DROP TRIGGER IF EXISTS trg_raw_observation_payload_immutable ON intelligence.raw_observation;
DROP FUNCTION IF EXISTS intelligence.reject_raw_observation_payload_mutation();
  `);
}
