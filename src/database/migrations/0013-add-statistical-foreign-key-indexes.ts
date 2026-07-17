import type { MigrationContext } from '../migration.types';

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE INDEX ix_indicator_statistical_domain_id ON statistics.indicator (statistical_domain_id);
CREATE INDEX ix_indicator_version_methodology_version_id ON statistics.indicator_version (methodology_version_id);
CREATE INDEX ix_indicator_version_unit_measure_id ON statistics.indicator_version (unit_measure_id);
CREATE INDEX ix_indicator_version_frequency_id ON statistics.indicator_version (frequency_id);
CREATE INDEX ix_dataset_indicator_indicator_version_id ON statistics.dataset_indicator (indicator_version_id);
CREATE INDEX ix_series_indicator_version_id ON statistics.series (indicator_version_id);
CREATE INDEX ix_series_frequency_id ON statistics.series (frequency_id);
CREATE INDEX ix_series_unit_measure_id ON statistics.series (unit_measure_id);
CREATE INDEX ix_series_dimension_value_code_item_id ON statistics.series_dimension_value (code_item_id);
CREATE INDEX ix_series_dimension_value_classification_item_id ON statistics.series_dimension_value (classification_item_id);
CREATE INDEX ix_series_dimension_value_geographic_unit_id ON statistics.series_dimension_value (geographic_unit_id);
CREATE INDEX ix_observation_revision_source_artifact_id ON statistics.observation_revision (source_artifact_id);
CREATE INDEX ix_observation_measure_measure_definition_id ON statistics.observation_measure (measure_definition_id);
CREATE INDEX ix_observation_attribute_value_attribute_definition_id ON statistics.observation_attribute_value (attribute_definition_id);
CREATE INDEX ix_observation_attribute_value_code_item_id ON statistics.observation_attribute_value (code_item_id);
CREATE INDEX ix_quality_rule_quality_dimension_id ON quality_lineage.quality_rule (quality_dimension_id);
CREATE INDEX ix_quality_assessment_quality_rule_id ON quality_lineage.quality_assessment (quality_rule_id);
CREATE INDEX ix_data_issue_quality_assessment_id ON quality_lineage.data_issue (quality_assessment_id);
CREATE INDEX ix_lineage_relation_methodology_version_id ON quality_lineage.lineage_relation (methodology_version_id);
CREATE INDEX ix_indicator_relation_source_indicator_version_id ON quality_lineage.indicator_relation (source_indicator_version_id);
CREATE INDEX ix_indicator_relation_target_indicator_version_id ON quality_lineage.indicator_relation (target_indicator_version_id);
CREATE INDEX ix_series_break_series_id ON quality_lineage.series_break (series_id);
CREATE INDEX ix_series_break_methodology_version_id ON quality_lineage.series_break (methodology_version_id);
CREATE INDEX ix_revision_history_lookup ON statistics.observation_revision (observation_id, valid_from DESC, valid_to) WHERE status = 'PUBLISHED';
CREATE INDEX ix_series_dataset_indicator ON statistics.series (dataset_version_id, indicator_version_id, series_id);
CREATE INDEX ix_issue_status_detected ON quality_lineage.data_issue (status, detected_at DESC);
CREATE INDEX ix_assessment_batch_time ON quality_lineage.quality_assessment (data_entry_batch_id, assessed_at DESC) WHERE data_entry_batch_id IS NOT NULL;
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP INDEX IF EXISTS quality_lineage.ix_assessment_batch_time;
DROP INDEX IF EXISTS quality_lineage.ix_issue_status_detected;
DROP INDEX IF EXISTS statistics.ix_series_dataset_indicator;
DROP INDEX IF EXISTS statistics.ix_revision_history_lookup;
DROP INDEX IF EXISTS statistics.ix_indicator_statistical_domain_id;
DROP INDEX IF EXISTS statistics.ix_indicator_version_methodology_version_id;
DROP INDEX IF EXISTS statistics.ix_indicator_version_unit_measure_id;
DROP INDEX IF EXISTS statistics.ix_indicator_version_frequency_id;
DROP INDEX IF EXISTS statistics.ix_dataset_indicator_indicator_version_id;
DROP INDEX IF EXISTS statistics.ix_series_indicator_version_id;
DROP INDEX IF EXISTS statistics.ix_series_frequency_id;
DROP INDEX IF EXISTS statistics.ix_series_unit_measure_id;
DROP INDEX IF EXISTS statistics.ix_series_dimension_value_code_item_id;
DROP INDEX IF EXISTS statistics.ix_series_dimension_value_classification_item_id;
DROP INDEX IF EXISTS statistics.ix_series_dimension_value_geographic_unit_id;
DROP INDEX IF EXISTS statistics.ix_observation_revision_source_artifact_id;
DROP INDEX IF EXISTS statistics.ix_observation_measure_measure_definition_id;
DROP INDEX IF EXISTS statistics.ix_observation_attribute_value_attribute_definition_id;
DROP INDEX IF EXISTS statistics.ix_observation_attribute_value_code_item_id;
DROP INDEX IF EXISTS quality_lineage.ix_quality_rule_quality_dimension_id;
DROP INDEX IF EXISTS quality_lineage.ix_quality_assessment_quality_rule_id;
DROP INDEX IF EXISTS quality_lineage.ix_data_issue_quality_assessment_id;
DROP INDEX IF EXISTS quality_lineage.ix_lineage_relation_methodology_version_id;
DROP INDEX IF EXISTS quality_lineage.ix_indicator_relation_source_indicator_version_id;
DROP INDEX IF EXISTS quality_lineage.ix_indicator_relation_target_indicator_version_id;
DROP INDEX IF EXISTS quality_lineage.ix_series_break_series_id;
DROP INDEX IF EXISTS quality_lineage.ix_series_break_methodology_version_id;
  `);
}
