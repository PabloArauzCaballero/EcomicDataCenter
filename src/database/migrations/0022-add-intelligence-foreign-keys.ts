import type { MigrationContext } from '../migration.types';

/** Wires the intelligence layer to the existing provenance and semantic core. */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
ALTER TABLE intelligence.ai_agent ADD CONSTRAINT fk_ai_agent_organization_id FOREIGN KEY (organization_id) REFERENCES provenance.organization (organization_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.agent_run ADD CONSTRAINT fk_agent_run_ai_agent_id FOREIGN KEY (ai_agent_id) REFERENCES intelligence.ai_agent (ai_agent_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.raw_observation ADD CONSTRAINT fk_raw_observation_agent_run_id FOREIGN KEY (agent_run_id) REFERENCES intelligence.agent_run (agent_run_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.raw_observation ADD CONSTRAINT fk_raw_observation_source_artifact_id FOREIGN KEY (source_artifact_id) REFERENCES provenance.source_artifact (source_artifact_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.economic_entity ADD CONSTRAINT fk_economic_entity_parent_entity_id FOREIGN KEY (parent_entity_id) REFERENCES intelligence.economic_entity (economic_entity_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.economic_entity ADD CONSTRAINT fk_economic_entity_classification_item_id FOREIGN KEY (classification_item_id) REFERENCES semantic.classification_item (classification_item_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.economic_entity ADD CONSTRAINT fk_economic_entity_geographic_unit_id FOREIGN KEY (geographic_unit_id) REFERENCES semantic.geographic_unit (geographic_unit_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.entity_alias ADD CONSTRAINT fk_entity_alias_economic_entity_id FOREIGN KEY (economic_entity_id) REFERENCES intelligence.economic_entity (economic_entity_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.fact_claim ADD CONSTRAINT fk_fact_claim_agent_run_id FOREIGN KEY (agent_run_id) REFERENCES intelligence.agent_run (agent_run_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.fact_claim ADD CONSTRAINT fk_fact_claim_raw_observation_id FOREIGN KEY (raw_observation_id) REFERENCES intelligence.raw_observation (raw_observation_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.fact_claim ADD CONSTRAINT fk_fact_claim_statistical_domain_id FOREIGN KEY (statistical_domain_id) REFERENCES semantic.statistical_domain (statistical_domain_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.fact_claim ADD CONSTRAINT fk_fact_claim_geographic_unit_id FOREIGN KEY (geographic_unit_id) REFERENCES semantic.geographic_unit (geographic_unit_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.fact_claim ADD CONSTRAINT fk_fact_claim_economic_entity_id FOREIGN KEY (economic_entity_id) REFERENCES intelligence.economic_entity (economic_entity_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.fact_claim ADD CONSTRAINT fk_fact_claim_superseded_by_claim_id FOREIGN KEY (superseded_by_claim_id) REFERENCES intelligence.fact_claim (fact_claim_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.claim_evidence ADD CONSTRAINT fk_claim_evidence_fact_claim_id FOREIGN KEY (fact_claim_id) REFERENCES intelligence.fact_claim (fact_claim_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.claim_evidence ADD CONSTRAINT fk_claim_evidence_source_artifact_id FOREIGN KEY (source_artifact_id) REFERENCES provenance.source_artifact (source_artifact_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.entity_mention ADD CONSTRAINT fk_entity_mention_fact_claim_id FOREIGN KEY (fact_claim_id) REFERENCES intelligence.fact_claim (fact_claim_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.entity_mention ADD CONSTRAINT fk_entity_mention_economic_entity_id FOREIGN KEY (economic_entity_id) REFERENCES intelligence.economic_entity (economic_entity_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE intelligence.data_contradiction ADD CONSTRAINT fk_data_contradiction_resolved_by_review_task_id FOREIGN KEY (resolved_by_review_task_id) REFERENCES intelligence.review_task (review_task_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE audit.audit_log ADD CONSTRAINT fk_audit_log_actor_organization_id FOREIGN KEY (actor_organization_id) REFERENCES provenance.organization (organization_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
ALTER TABLE audit.audit_log DROP CONSTRAINT IF EXISTS fk_audit_log_actor_organization_id;
ALTER TABLE intelligence.data_contradiction DROP CONSTRAINT IF EXISTS fk_data_contradiction_resolved_by_review_task_id;
ALTER TABLE intelligence.entity_mention DROP CONSTRAINT IF EXISTS fk_entity_mention_economic_entity_id;
ALTER TABLE intelligence.entity_mention DROP CONSTRAINT IF EXISTS fk_entity_mention_fact_claim_id;
ALTER TABLE intelligence.claim_evidence DROP CONSTRAINT IF EXISTS fk_claim_evidence_source_artifact_id;
ALTER TABLE intelligence.claim_evidence DROP CONSTRAINT IF EXISTS fk_claim_evidence_fact_claim_id;
ALTER TABLE intelligence.fact_claim DROP CONSTRAINT IF EXISTS fk_fact_claim_superseded_by_claim_id;
ALTER TABLE intelligence.fact_claim DROP CONSTRAINT IF EXISTS fk_fact_claim_economic_entity_id;
ALTER TABLE intelligence.fact_claim DROP CONSTRAINT IF EXISTS fk_fact_claim_geographic_unit_id;
ALTER TABLE intelligence.fact_claim DROP CONSTRAINT IF EXISTS fk_fact_claim_statistical_domain_id;
ALTER TABLE intelligence.fact_claim DROP CONSTRAINT IF EXISTS fk_fact_claim_raw_observation_id;
ALTER TABLE intelligence.fact_claim DROP CONSTRAINT IF EXISTS fk_fact_claim_agent_run_id;
ALTER TABLE intelligence.entity_alias DROP CONSTRAINT IF EXISTS fk_entity_alias_economic_entity_id;
ALTER TABLE intelligence.economic_entity DROP CONSTRAINT IF EXISTS fk_economic_entity_geographic_unit_id;
ALTER TABLE intelligence.economic_entity DROP CONSTRAINT IF EXISTS fk_economic_entity_classification_item_id;
ALTER TABLE intelligence.economic_entity DROP CONSTRAINT IF EXISTS fk_economic_entity_parent_entity_id;
ALTER TABLE intelligence.raw_observation DROP CONSTRAINT IF EXISTS fk_raw_observation_source_artifact_id;
ALTER TABLE intelligence.raw_observation DROP CONSTRAINT IF EXISTS fk_raw_observation_agent_run_id;
ALTER TABLE intelligence.agent_run DROP CONSTRAINT IF EXISTS fk_agent_run_ai_agent_id;
ALTER TABLE intelligence.ai_agent DROP CONSTRAINT IF EXISTS fk_ai_agent_organization_id;
  `);
}
