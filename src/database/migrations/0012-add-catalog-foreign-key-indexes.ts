import type { MigrationContext } from '../migration.types';

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE INDEX ix_organization_parent_organization_id ON provenance.organization (parent_organization_id);
CREATE INDEX ix_source_organization_id ON provenance.source (organization_id);
CREATE INDEX ix_source_frequency_id ON provenance.source (frequency_id);
CREATE INDEX ix_source_artifact_source_id ON provenance.source_artifact (source_id);
CREATE INDEX ix_data_entry_batch_dataset_version_id ON provenance.data_entry_batch (dataset_version_id);
CREATE INDEX ix_data_entry_batch_source_artifact_id ON provenance.data_entry_batch (source_artifact_id);
CREATE INDEX ix_data_entry_batch_submitted_by_organization_id ON provenance.data_entry_batch (submitted_by_organization_id);
CREATE INDEX ix_statistical_domain_parent_domain_id ON semantic.statistical_domain (parent_domain_id);
CREATE INDEX ix_code_item_parent_code_item_id ON semantic.code_item (parent_code_item_id);
CREATE INDEX ix_classification_item_parent_item_id ON semantic.classification_item (parent_item_id);
CREATE INDEX ix_classification_mapping_target_item_id ON semantic.classification_mapping (target_item_id);
CREATE INDEX ix_geographic_unit_parent_geographic_unit_id ON semantic.geographic_unit (parent_geographic_unit_id);
CREATE INDEX ix_unit_measure_base_unit_measure_id ON semantic.unit_measure (base_unit_measure_id);
CREATE INDEX ix_dataset_statistical_operation_id ON metadata.dataset (statistical_operation_id);
CREATE INDEX ix_dataset_source_id ON metadata.dataset (source_id);
CREATE INDEX ix_dataset_statistical_domain_id ON metadata.dataset (statistical_domain_id);
CREATE INDEX ix_dataset_version_methodology_version_id ON metadata.dataset_version (methodology_version_id);
CREATE INDEX ix_dataset_version_data_structure_id ON metadata.dataset_version (data_structure_id);
CREATE INDEX ix_dimension_definition_concept_id ON metadata.dimension_definition (concept_id);
CREATE INDEX ix_dimension_definition_code_list_id ON metadata.dimension_definition (code_list_id);
CREATE INDEX ix_dimension_definition_classification_version_id ON metadata.dimension_definition (classification_version_id);
CREATE INDEX ix_measure_definition_concept_id ON metadata.measure_definition (concept_id);
CREATE INDEX ix_measure_definition_unit_measure_id ON metadata.measure_definition (unit_measure_id);
CREATE INDEX ix_attribute_definition_concept_id ON metadata.attribute_definition (concept_id);
CREATE INDEX ix_attribute_definition_code_list_id ON metadata.attribute_definition (code_list_id);
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP INDEX IF EXISTS metadata.ix_attribute_definition_code_list_id;
DROP INDEX IF EXISTS metadata.ix_attribute_definition_concept_id;
DROP INDEX IF EXISTS metadata.ix_measure_definition_unit_measure_id;
DROP INDEX IF EXISTS metadata.ix_measure_definition_concept_id;
DROP INDEX IF EXISTS metadata.ix_dimension_definition_classification_version_id;
DROP INDEX IF EXISTS metadata.ix_dimension_definition_code_list_id;
DROP INDEX IF EXISTS metadata.ix_dimension_definition_concept_id;
DROP INDEX IF EXISTS metadata.ix_dataset_version_data_structure_id;
DROP INDEX IF EXISTS metadata.ix_dataset_version_methodology_version_id;
DROP INDEX IF EXISTS metadata.ix_dataset_statistical_domain_id;
DROP INDEX IF EXISTS metadata.ix_dataset_source_id;
DROP INDEX IF EXISTS metadata.ix_dataset_statistical_operation_id;
DROP INDEX IF EXISTS semantic.ix_unit_measure_base_unit_measure_id;
DROP INDEX IF EXISTS semantic.ix_geographic_unit_parent_geographic_unit_id;
DROP INDEX IF EXISTS semantic.ix_classification_mapping_target_item_id;
DROP INDEX IF EXISTS semantic.ix_classification_item_parent_item_id;
DROP INDEX IF EXISTS semantic.ix_code_item_parent_code_item_id;
DROP INDEX IF EXISTS semantic.ix_statistical_domain_parent_domain_id;
DROP INDEX IF EXISTS provenance.ix_data_entry_batch_submitted_by_organization_id;
DROP INDEX IF EXISTS provenance.ix_data_entry_batch_source_artifact_id;
DROP INDEX IF EXISTS provenance.ix_data_entry_batch_dataset_version_id;
DROP INDEX IF EXISTS provenance.ix_source_artifact_source_id;
DROP INDEX IF EXISTS provenance.ix_source_frequency_id;
DROP INDEX IF EXISTS provenance.ix_source_organization_id;
DROP INDEX IF EXISTS provenance.ix_organization_parent_organization_id;
  `);
}
