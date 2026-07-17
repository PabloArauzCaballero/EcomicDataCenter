import type { MigrationContext } from '../migration.types';

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
ALTER TABLE provenance.organization
  ADD CONSTRAINT ck_organization_country_code_format
  CHECK (country_code ~ '^[A-Z]{2}$');
ALTER TABLE provenance.source_artifact
  ADD CONSTRAINT ck_source_artifact_sha256_format
  CHECK (sha256 ~ '^[0-9A-Fa-f]{64}$');
ALTER TABLE provenance.data_entry_batch
  ADD CONSTRAINT ck_batch_started_after_submission
  CHECK (started_at IS NULL OR started_at >= submitted_at),
  ADD CONSTRAINT ck_batch_completed_after_submission
  CHECK (completed_at IS NULL OR completed_at >= submitted_at),
  ADD CONSTRAINT ck_batch_terminal_counts
  CHECK (
    status NOT IN ('COMMITTED', 'PARTIAL', 'REJECTED')
    OR accepted_count + rejected_count = received_count
  );

ALTER TABLE semantic.statistical_domain
  ADD CONSTRAINT ck_statistical_domain_sort_order CHECK (sort_order >= 0);
ALTER TABLE semantic.code_item
  ADD CONSTRAINT ck_code_item_sort_order CHECK (sort_order >= 0);
ALTER TABLE semantic.classification_item
  ADD CONSTRAINT ck_classification_item_level CHECK (level_no >= 0),
  ADD CONSTRAINT ck_classification_item_sort_order CHECK (sort_order >= 0);
ALTER TABLE semantic.classification_mapping
  ADD CONSTRAINT ck_classification_mapping_distinct_items
  CHECK (source_item_id <> target_item_id);

ALTER TABLE metadata.methodology_version
  ADD CONSTRAINT ck_methodology_current_published
  CHECK (NOT is_current OR status = 'PUBLISHED');
ALTER TABLE metadata.dataset_version
  ADD CONSTRAINT ck_dataset_current_published
  CHECK (NOT is_current OR status = 'PUBLISHED');
ALTER TABLE metadata.dimension_definition
  ADD CONSTRAINT ck_dimension_representation_kind
  CHECK (representation_kind IN ('CODE_LIST', 'CLASSIFICATION', 'GEOGRAPHY', 'TEXT', 'NUMERIC', 'DATE')),
  ADD CONSTRAINT ck_dimension_representation_reference
  CHECK (
    (representation_kind = 'CODE_LIST' AND code_list_id IS NOT NULL AND classification_version_id IS NULL)
    OR (representation_kind = 'CLASSIFICATION' AND classification_version_id IS NOT NULL AND code_list_id IS NULL)
    OR (representation_kind IN ('GEOGRAPHY', 'TEXT', 'NUMERIC', 'DATE')
        AND code_list_id IS NULL AND classification_version_id IS NULL)
  );
ALTER TABLE metadata.measure_definition
  ADD CONSTRAINT ck_measure_data_type CHECK (data_type IN ('NUMERIC', 'TEXT', 'BOOLEAN')),
  ADD CONSTRAINT ck_measure_precision_scale
  CHECK (precision_scale IS NULL OR (data_type = 'NUMERIC' AND precision_scale BETWEEN 0 AND 12));
ALTER TABLE metadata.attribute_definition
  ADD CONSTRAINT ck_attribute_data_type CHECK (data_type IN ('CODE', 'NUMERIC', 'TEXT', 'BOOLEAN')),
  ADD CONSTRAINT ck_attribute_code_list
  CHECK ((data_type = 'CODE' AND code_list_id IS NOT NULL) OR (data_type <> 'CODE' AND code_list_id IS NULL));

ALTER TABLE statistics.dataset_indicator
  ADD CONSTRAINT ck_dataset_indicator_sort_order CHECK (sort_order >= 0);
ALTER TABLE statistics.series
  ADD CONSTRAINT ck_series_key_hash_format CHECK (series_key_hash ~ '^[0-9A-Fa-f]{64}$');
ALTER TABLE statistics.observation_revision
  ADD CONSTRAINT ck_observation_revision_hash_format CHECK (normalized_hash ~ '^[0-9A-Fa-f]{64}$'),
  ADD CONSTRAINT ck_observation_revision_current_published CHECK (NOT is_current OR status = 'PUBLISHED');

ALTER TABLE quality_lineage.quality_rule
  ADD CONSTRAINT ck_quality_rule_severity CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL'));
ALTER TABLE quality_lineage.quality_assessment
  ADD CONSTRAINT ck_quality_assessment_status CHECK (status IN ('PASS', 'WARNING', 'FAIL', 'ERROR'));
ALTER TABLE quality_lineage.data_issue
  ADD CONSTRAINT ck_data_issue_severity CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  ADD CONSTRAINT ck_data_issue_resolution_after_detection
  CHECK (resolved_at IS NULL OR resolved_at >= detected_at);
ALTER TABLE quality_lineage.lineage_relation
  ADD CONSTRAINT ck_lineage_distinct_endpoints
  CHECK (source_entity_type <> target_entity_type OR source_entity_id <> target_entity_id);
ALTER TABLE quality_lineage.indicator_relation
  ADD CONSTRAINT ck_indicator_relation_distinct_versions
  CHECK (source_indicator_version_id <> target_indicator_version_id);

CREATE UNIQUE INDEX uq_classification_mapping_null_valid_from
  ON semantic.classification_mapping (source_item_id, target_item_id)
  WHERE valid_from IS NULL;

CREATE UNIQUE INDEX uq_dimension_definition_time
  ON metadata.dimension_definition (data_structure_id)
  WHERE is_time_dimension = true;
CREATE UNIQUE INDEX uq_dataset_indicator_primary
  ON statistics.dataset_indicator (dataset_version_id)
  WHERE is_primary = true;

CREATE OR REPLACE FUNCTION statistics.enforce_series_indicator_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.indicator_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM statistics.dataset_indicator link
    WHERE link.dataset_version_id = NEW.dataset_version_id
      AND link.indicator_version_id = NEW.indicator_version_id
  ) THEN
    RAISE EXCEPTION 'Indicator version is not linked to the dataset version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_series_indicator_membership
BEFORE INSERT OR UPDATE OF dataset_version_id, indicator_version_id
ON statistics.series
FOR EACH ROW EXECUTE FUNCTION statistics.enforce_series_indicator_membership();

CREATE OR REPLACE FUNCTION statistics.enforce_series_dimension_context()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  definition_structure uuid;
  series_structure uuid;
  representation varchar(30);
  expected_code_list uuid;
  expected_classification uuid;
  actual_code_list uuid;
  actual_classification uuid;
BEGIN
  SELECT definition.data_structure_id, definition.representation_kind,
         definition.code_list_id, definition.classification_version_id,
         dataset_version.data_structure_id
    INTO definition_structure, representation, expected_code_list,
         expected_classification, series_structure
  FROM metadata.dimension_definition definition
  JOIN statistics.series series_row ON series_row.series_id = NEW.series_id
  JOIN metadata.dataset_version dataset_version
    ON dataset_version.dataset_version_id = series_row.dataset_version_id
  WHERE definition.dimension_definition_id = NEW.dimension_definition_id;

  IF definition_structure IS NULL OR definition_structure <> series_structure THEN
    RAISE EXCEPTION 'Dimension definition does not belong to the series data structure';
  END IF;

  IF NEW.code_item_id IS NOT NULL THEN
    SELECT code_list_id INTO actual_code_list
    FROM semantic.code_item WHERE code_item_id = NEW.code_item_id;
  END IF;
  IF NEW.classification_item_id IS NOT NULL THEN
    SELECT classification_version_id INTO actual_classification
    FROM semantic.classification_item WHERE classification_item_id = NEW.classification_item_id;
  END IF;

  IF representation = 'CODE_LIST' AND actual_code_list IS DISTINCT FROM expected_code_list THEN
    RAISE EXCEPTION 'Code item does not belong to the dimension code list';
  ELSIF representation = 'CLASSIFICATION'
      AND actual_classification IS DISTINCT FROM expected_classification THEN
    RAISE EXCEPTION 'Classification item does not belong to the dimension version';
  ELSIF representation = 'GEOGRAPHY' AND NEW.geographic_unit_id IS NULL THEN
    RAISE EXCEPTION 'Geographic dimension requires a geographic unit';
  ELSIF representation = 'TEXT' AND NEW.text_value IS NULL THEN
    RAISE EXCEPTION 'Text dimension requires a text value';
  ELSIF representation = 'NUMERIC' AND NEW.numeric_value IS NULL THEN
    RAISE EXCEPTION 'Numeric dimension requires a numeric value';
  ELSIF representation = 'DATE' AND NEW.date_value IS NULL THEN
    RAISE EXCEPTION 'Date dimension requires a date value';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_series_dimension_context
BEFORE INSERT OR UPDATE ON statistics.series_dimension_value
FOR EACH ROW EXECUTE FUNCTION statistics.enforce_series_dimension_context();
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP TRIGGER IF EXISTS trg_series_dimension_context ON statistics.series_dimension_value;
DROP FUNCTION IF EXISTS statistics.enforce_series_dimension_context();
DROP TRIGGER IF EXISTS trg_series_indicator_membership ON statistics.series;
DROP FUNCTION IF EXISTS statistics.enforce_series_indicator_membership();
DROP INDEX IF EXISTS statistics.uq_dataset_indicator_primary;
DROP INDEX IF EXISTS metadata.uq_dimension_definition_time;
DROP INDEX IF EXISTS semantic.uq_classification_mapping_null_valid_from;
ALTER TABLE quality_lineage.indicator_relation DROP CONSTRAINT IF EXISTS ck_indicator_relation_distinct_versions;
ALTER TABLE quality_lineage.lineage_relation DROP CONSTRAINT IF EXISTS ck_lineage_distinct_endpoints;
ALTER TABLE quality_lineage.data_issue DROP CONSTRAINT IF EXISTS ck_data_issue_resolution_after_detection;
ALTER TABLE quality_lineage.data_issue DROP CONSTRAINT IF EXISTS ck_data_issue_severity;
ALTER TABLE quality_lineage.quality_assessment DROP CONSTRAINT IF EXISTS ck_quality_assessment_status;
ALTER TABLE quality_lineage.quality_rule DROP CONSTRAINT IF EXISTS ck_quality_rule_severity;
ALTER TABLE statistics.observation_revision DROP CONSTRAINT IF EXISTS ck_observation_revision_current_published;
ALTER TABLE statistics.observation_revision DROP CONSTRAINT IF EXISTS ck_observation_revision_hash_format;
ALTER TABLE statistics.series DROP CONSTRAINT IF EXISTS ck_series_key_hash_format;
ALTER TABLE statistics.dataset_indicator DROP CONSTRAINT IF EXISTS ck_dataset_indicator_sort_order;
ALTER TABLE metadata.attribute_definition DROP CONSTRAINT IF EXISTS ck_attribute_code_list;
ALTER TABLE metadata.attribute_definition DROP CONSTRAINT IF EXISTS ck_attribute_data_type;
ALTER TABLE metadata.measure_definition DROP CONSTRAINT IF EXISTS ck_measure_precision_scale;
ALTER TABLE metadata.measure_definition DROP CONSTRAINT IF EXISTS ck_measure_data_type;
ALTER TABLE metadata.dimension_definition DROP CONSTRAINT IF EXISTS ck_dimension_representation_reference;
ALTER TABLE metadata.dimension_definition DROP CONSTRAINT IF EXISTS ck_dimension_representation_kind;
ALTER TABLE metadata.dataset_version DROP CONSTRAINT IF EXISTS ck_dataset_current_published;
ALTER TABLE metadata.methodology_version DROP CONSTRAINT IF EXISTS ck_methodology_current_published;
ALTER TABLE semantic.classification_mapping DROP CONSTRAINT IF EXISTS ck_classification_mapping_distinct_items;
ALTER TABLE semantic.classification_item DROP CONSTRAINT IF EXISTS ck_classification_item_sort_order;
ALTER TABLE semantic.classification_item DROP CONSTRAINT IF EXISTS ck_classification_item_level;
ALTER TABLE semantic.code_item DROP CONSTRAINT IF EXISTS ck_code_item_sort_order;
ALTER TABLE semantic.statistical_domain DROP CONSTRAINT IF EXISTS ck_statistical_domain_sort_order;
ALTER TABLE provenance.data_entry_batch DROP CONSTRAINT IF EXISTS ck_batch_terminal_counts;
ALTER TABLE provenance.data_entry_batch DROP CONSTRAINT IF EXISTS ck_batch_completed_after_submission;
ALTER TABLE provenance.data_entry_batch DROP CONSTRAINT IF EXISTS ck_batch_started_after_submission;
ALTER TABLE provenance.source_artifact DROP CONSTRAINT IF EXISTS ck_source_artifact_sha256_format;
ALTER TABLE provenance.organization DROP CONSTRAINT IF EXISTS ck_organization_country_code_format;
  `);
}
