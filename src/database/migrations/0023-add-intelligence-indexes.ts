import type { MigrationContext } from '../migration.types';

/**
 * Indexes every intelligence foreign key plus the operational access paths.
 *
 * Foreign keys without a leading index are the usual cause of lock escalation
 * during deletes and of unbounded scans on daily agent traffic, so the project
 * gate requires each one to be covered.
 */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE INDEX ix_ai_agent_organization_id ON intelligence.ai_agent (organization_id);
CREATE INDEX ix_agent_run_ai_agent_id ON intelligence.agent_run (ai_agent_id);
CREATE INDEX ix_raw_observation_source_artifact_id ON intelligence.raw_observation (source_artifact_id);
CREATE INDEX ix_economic_entity_parent_entity_id ON intelligence.economic_entity (parent_entity_id);
CREATE INDEX ix_economic_entity_classification_item_id ON intelligence.economic_entity (classification_item_id);
CREATE INDEX ix_economic_entity_geographic_unit_id ON intelligence.economic_entity (geographic_unit_id);
CREATE INDEX ix_entity_alias_economic_entity_id ON intelligence.entity_alias (economic_entity_id);
CREATE INDEX ix_fact_claim_agent_run_id ON intelligence.fact_claim (agent_run_id);
CREATE INDEX ix_fact_claim_raw_observation_id ON intelligence.fact_claim (raw_observation_id);
CREATE INDEX ix_fact_claim_statistical_domain_id ON intelligence.fact_claim (statistical_domain_id);
CREATE INDEX ix_fact_claim_geographic_unit_id ON intelligence.fact_claim (geographic_unit_id);
CREATE INDEX ix_fact_claim_economic_entity_id ON intelligence.fact_claim (economic_entity_id);
CREATE INDEX ix_fact_claim_superseded_by_claim_id ON intelligence.fact_claim (superseded_by_claim_id);
CREATE INDEX ix_claim_evidence_source_artifact_id ON intelligence.claim_evidence (source_artifact_id);
CREATE INDEX ix_entity_mention_fact_claim_id ON intelligence.entity_mention (fact_claim_id);
CREATE INDEX ix_entity_mention_economic_entity_id ON intelligence.entity_mention (economic_entity_id);
CREATE INDEX ix_data_contradiction_resolved_by_review_task_id ON intelligence.data_contradiction (resolved_by_review_task_id);
CREATE INDEX ix_audit_log_actor_organization_id ON audit.audit_log (actor_organization_id);
CREATE INDEX ix_agent_run_started_at ON intelligence.agent_run (started_at DESC);
CREATE INDEX ix_agent_run_status ON intelligence.agent_run (status);
CREATE INDEX ix_raw_observation_processing_status ON intelligence.raw_observation (processing_status);
CREATE INDEX ix_fact_claim_status_created_at ON intelligence.fact_claim (status, created_at DESC);
CREATE INDEX ix_fact_claim_event_date ON intelligence.fact_claim (event_date DESC);
CREATE INDEX ix_entity_alias_normalized_alias ON intelligence.entity_alias (normalized_alias);
CREATE INDEX ix_data_contradiction_status ON intelligence.data_contradiction (status);
CREATE INDEX ix_review_task_status_priority ON intelligence.review_task (status, priority);
CREATE INDEX ix_audit_log_occurred_at ON audit.audit_log (occurred_at DESC);
CREATE INDEX ix_audit_log_entity_type_entity_reference ON audit.audit_log (entity_type, entity_reference);
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP INDEX IF EXISTS audit.ix_audit_log_entity_type_entity_reference;
DROP INDEX IF EXISTS audit.ix_audit_log_occurred_at;
DROP INDEX IF EXISTS intelligence.ix_review_task_status_priority;
DROP INDEX IF EXISTS intelligence.ix_data_contradiction_status;
DROP INDEX IF EXISTS intelligence.ix_entity_alias_normalized_alias;
DROP INDEX IF EXISTS intelligence.ix_fact_claim_event_date;
DROP INDEX IF EXISTS intelligence.ix_fact_claim_status_created_at;
DROP INDEX IF EXISTS intelligence.ix_raw_observation_processing_status;
DROP INDEX IF EXISTS intelligence.ix_agent_run_status;
DROP INDEX IF EXISTS intelligence.ix_agent_run_started_at;
DROP INDEX IF EXISTS audit.ix_audit_log_actor_organization_id;
DROP INDEX IF EXISTS intelligence.ix_data_contradiction_resolved_by_review_task_id;
DROP INDEX IF EXISTS intelligence.ix_entity_mention_economic_entity_id;
DROP INDEX IF EXISTS intelligence.ix_entity_mention_fact_claim_id;
DROP INDEX IF EXISTS intelligence.ix_claim_evidence_source_artifact_id;
DROP INDEX IF EXISTS intelligence.ix_fact_claim_superseded_by_claim_id;
DROP INDEX IF EXISTS intelligence.ix_fact_claim_economic_entity_id;
DROP INDEX IF EXISTS intelligence.ix_fact_claim_geographic_unit_id;
DROP INDEX IF EXISTS intelligence.ix_fact_claim_statistical_domain_id;
DROP INDEX IF EXISTS intelligence.ix_fact_claim_raw_observation_id;
DROP INDEX IF EXISTS intelligence.ix_fact_claim_agent_run_id;
DROP INDEX IF EXISTS intelligence.ix_entity_alias_economic_entity_id;
DROP INDEX IF EXISTS intelligence.ix_economic_entity_geographic_unit_id;
DROP INDEX IF EXISTS intelligence.ix_economic_entity_classification_item_id;
DROP INDEX IF EXISTS intelligence.ix_economic_entity_parent_entity_id;
DROP INDEX IF EXISTS intelligence.ix_raw_observation_source_artifact_id;
DROP INDEX IF EXISTS intelligence.ix_agent_run_ai_agent_id;
DROP INDEX IF EXISTS intelligence.ix_ai_agent_organization_id;
  `);
}
