import type { MigrationContext } from '../migration.types';

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE UNIQUE INDEX uq_classification_version_current
  ON semantic.classification_version (classification_id)
  WHERE is_current = true;

CREATE UNIQUE INDEX uq_methodology_version_current
  ON metadata.methodology_version (methodology_id)
  WHERE is_current = true;

CREATE UNIQUE INDEX uq_dataset_version_current
  ON metadata.dataset_version (dataset_id)
  WHERE is_current = true;

CREATE UNIQUE INDEX uq_observation_revision_current
  ON statistics.observation_revision (observation_id)
  WHERE is_current = true;

CREATE INDEX ix_observation_revision_vintage
  ON statistics.observation_revision (observation_id, vintage_date DESC, revision_number DESC);
CREATE INDEX ix_observation_revision_batch
  ON statistics.observation_revision (data_entry_batch_id);
CREATE INDEX ix_observation_period
  ON statistics.observation (period_start, period_end, series_id);
CREATE INDEX ix_series_dataset_status
  ON statistics.series (dataset_version_id, status);
CREATE INDEX ix_series_dimension_code
  ON statistics.series_dimension_value (dimension_definition_id, code_item_id)
  WHERE code_item_id IS NOT NULL;
CREATE INDEX ix_series_dimension_classification
  ON statistics.series_dimension_value (dimension_definition_id, classification_item_id)
  WHERE classification_item_id IS NOT NULL;
CREATE INDEX ix_series_dimension_geography
  ON statistics.series_dimension_value (dimension_definition_id, geographic_unit_id)
  WHERE geographic_unit_id IS NOT NULL;
CREATE INDEX ix_quality_assessment_target
  ON quality_lineage.quality_assessment (target_entity_type, target_entity_id, assessed_at DESC);
CREATE INDEX ix_data_issue_target_status
  ON quality_lineage.data_issue (target_entity_type, target_entity_id, status);
CREATE INDEX ix_lineage_target
  ON quality_lineage.lineage_relation (target_entity_type, target_entity_id);
CREATE INDEX ix_lineage_source
  ON quality_lineage.lineage_relation (source_entity_type, source_entity_id);

CREATE OR REPLACE FUNCTION semantic.enforce_classification_parent_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_version uuid;
BEGIN
  IF NEW.parent_item_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT classification_version_id INTO parent_version
  FROM semantic.classification_item
  WHERE classification_item_id = NEW.parent_item_id;
  IF parent_version IS DISTINCT FROM NEW.classification_version_id THEN
    RAISE EXCEPTION 'Parent classification item must belong to the same classification version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_classification_parent_version
BEFORE INSERT OR UPDATE OF parent_item_id, classification_version_id
ON semantic.classification_item
FOR EACH ROW EXECUTE FUNCTION semantic.enforce_classification_parent_version();

CREATE OR REPLACE FUNCTION semantic.enforce_code_item_parent_list()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_list uuid;
BEGIN
  IF NEW.parent_code_item_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT code_list_id INTO parent_list
  FROM semantic.code_item
  WHERE code_item_id = NEW.parent_code_item_id;
  IF parent_list IS DISTINCT FROM NEW.code_list_id THEN
    RAISE EXCEPTION 'Parent code item must belong to the same code list';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_code_item_parent_list
BEFORE INSERT OR UPDATE OF parent_code_item_id, code_list_id
ON semantic.code_item
FOR EACH ROW EXECUTE FUNCTION semantic.enforce_code_item_parent_list();

CREATE OR REPLACE FUNCTION provenance.reject_source_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'source_artifact is immutable; create a new artifact instead';
END;
$$;

CREATE TRIGGER trg_source_artifact_immutable_update
BEFORE UPDATE OR DELETE ON provenance.source_artifact
FOR EACH ROW EXECUTE FUNCTION provenance.reject_source_artifact_mutation();

CREATE OR REPLACE VIEW read_models.current_observation_value AS
SELECT
  o.observation_id,
  o.series_id,
  s.dataset_version_id,
  s.indicator_version_id,
  s.frequency_id,
  s.unit_measure_id AS series_unit_measure_id,
  s.series_key,
  o.period_start,
  o.period_end,
  o.period_code,
  o.reference_date,
  r.observation_revision_id,
  r.revision_number,
  r.publication_date,
  r.vintage_date,
  r.confidentiality_status,
  r.source_artifact_id,
  r.data_entry_batch_id,
  m.measure_definition_id,
  md.code AS measure_code,
  md.name AS measure_name,
  md.unit_measure_id AS measure_unit_measure_id,
  m.numeric_value,
  m.text_value,
  m.boolean_value
FROM statistics.observation o
JOIN statistics.series s ON s.series_id = o.series_id
JOIN statistics.observation_revision r
  ON r.observation_id = o.observation_id
 AND r.is_current = true
 AND r.status = 'PUBLISHED'
JOIN statistics.observation_measure m
  ON m.observation_revision_id = r.observation_revision_id
JOIN metadata.measure_definition md
  ON md.measure_definition_id = m.measure_definition_id;
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP VIEW IF EXISTS read_models.current_observation_value;
DROP TRIGGER IF EXISTS trg_source_artifact_immutable_update ON provenance.source_artifact;
DROP FUNCTION IF EXISTS provenance.reject_source_artifact_mutation();
DROP TRIGGER IF EXISTS trg_code_item_parent_list ON semantic.code_item;
DROP FUNCTION IF EXISTS semantic.enforce_code_item_parent_list();
DROP TRIGGER IF EXISTS trg_classification_parent_version ON semantic.classification_item;
DROP FUNCTION IF EXISTS semantic.enforce_classification_parent_version();
DROP INDEX IF EXISTS quality_lineage.ix_lineage_source;
DROP INDEX IF EXISTS quality_lineage.ix_lineage_target;
DROP INDEX IF EXISTS quality_lineage.ix_data_issue_target_status;
DROP INDEX IF EXISTS quality_lineage.ix_quality_assessment_target;
DROP INDEX IF EXISTS statistics.ix_series_dimension_geography;
DROP INDEX IF EXISTS statistics.ix_series_dimension_classification;
DROP INDEX IF EXISTS statistics.ix_series_dimension_code;
DROP INDEX IF EXISTS statistics.ix_series_dataset_status;
DROP INDEX IF EXISTS statistics.ix_observation_period;
DROP INDEX IF EXISTS statistics.ix_observation_revision_batch;
DROP INDEX IF EXISTS statistics.ix_observation_revision_vintage;
DROP INDEX IF EXISTS statistics.uq_observation_revision_current;
DROP INDEX IF EXISTS metadata.uq_dataset_version_current;
DROP INDEX IF EXISTS metadata.uq_methodology_version_current;
DROP INDEX IF EXISTS semantic.uq_classification_version_current;
  `);
}
