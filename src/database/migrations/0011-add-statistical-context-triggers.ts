import type { MigrationContext } from '../migration.types';

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE OR REPLACE FUNCTION statistics.enforce_observation_revision_context()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  observation_dataset_version uuid;
  batch_dataset_version uuid;
  batch_artifact uuid;
BEGIN
  SELECT series_row.dataset_version_id
    INTO observation_dataset_version
  FROM statistics.observation observation_row
  JOIN statistics.series series_row ON series_row.series_id = observation_row.series_id
  WHERE observation_row.observation_id = NEW.observation_id;

  SELECT batch.dataset_version_id, batch.source_artifact_id
    INTO batch_dataset_version, batch_artifact
  FROM provenance.data_entry_batch batch
  WHERE batch.data_entry_batch_id = NEW.data_entry_batch_id;

  IF observation_dataset_version IS DISTINCT FROM batch_dataset_version THEN
    RAISE EXCEPTION 'Observation revision batch belongs to a different dataset version';
  END IF;
  IF batch_artifact IS NOT NULL AND batch_artifact IS DISTINCT FROM NEW.source_artifact_id THEN
    RAISE EXCEPTION 'Observation revision artifact differs from its data entry batch artifact';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_observation_revision_context
BEFORE INSERT OR UPDATE OF observation_id, source_artifact_id, data_entry_batch_id
ON statistics.observation_revision
FOR EACH ROW EXECUTE FUNCTION statistics.enforce_observation_revision_context();

CREATE OR REPLACE FUNCTION statistics.enforce_observation_measure_context()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_structure uuid;
  definition_structure uuid;
  expected_type varchar(30);
BEGIN
  SELECT dataset_version.data_structure_id
    INTO expected_structure
  FROM statistics.observation_revision revision
  JOIN statistics.observation observation_row
    ON observation_row.observation_id = revision.observation_id
  JOIN statistics.series series_row ON series_row.series_id = observation_row.series_id
  JOIN metadata.dataset_version dataset_version
    ON dataset_version.dataset_version_id = series_row.dataset_version_id
  WHERE revision.observation_revision_id = NEW.observation_revision_id;

  SELECT definition.data_structure_id, definition.data_type
    INTO definition_structure, expected_type
  FROM metadata.measure_definition definition
  WHERE definition.measure_definition_id = NEW.measure_definition_id;

  IF expected_structure IS DISTINCT FROM definition_structure THEN
    RAISE EXCEPTION 'Measure definition does not belong to the observation data structure';
  END IF;
  IF expected_type = 'NUMERIC' AND NEW.numeric_value IS NULL THEN
    RAISE EXCEPTION 'Numeric measure requires numeric_value';
  ELSIF expected_type = 'TEXT' AND NEW.text_value IS NULL THEN
    RAISE EXCEPTION 'Text measure requires text_value';
  ELSIF expected_type = 'BOOLEAN' AND NEW.boolean_value IS NULL THEN
    RAISE EXCEPTION 'Boolean measure requires boolean_value';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_observation_measure_context
BEFORE INSERT OR UPDATE ON statistics.observation_measure
FOR EACH ROW EXECUTE FUNCTION statistics.enforce_observation_measure_context();

CREATE OR REPLACE FUNCTION statistics.enforce_observation_attribute_context()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_structure uuid;
  definition_structure uuid;
  expected_type varchar(30);
  expected_code_list uuid;
  actual_code_list uuid;
BEGIN
  SELECT dataset_version.data_structure_id
    INTO expected_structure
  FROM statistics.observation_revision revision
  JOIN statistics.observation observation_row
    ON observation_row.observation_id = revision.observation_id
  JOIN statistics.series series_row ON series_row.series_id = observation_row.series_id
  JOIN metadata.dataset_version dataset_version
    ON dataset_version.dataset_version_id = series_row.dataset_version_id
  WHERE revision.observation_revision_id = NEW.observation_revision_id;

  SELECT definition.data_structure_id, definition.data_type, definition.code_list_id
    INTO definition_structure, expected_type, expected_code_list
  FROM metadata.attribute_definition definition
  WHERE definition.attribute_definition_id = NEW.attribute_definition_id;

  IF expected_structure IS DISTINCT FROM definition_structure THEN
    RAISE EXCEPTION 'Attribute definition does not belong to the observation data structure';
  END IF;
  IF NEW.code_item_id IS NOT NULL THEN
    SELECT code_list_id INTO actual_code_list
    FROM semantic.code_item WHERE code_item_id = NEW.code_item_id;
  END IF;

  IF expected_type = 'CODE' AND actual_code_list IS DISTINCT FROM expected_code_list THEN
    RAISE EXCEPTION 'Code item does not belong to the attribute code list';
  ELSIF expected_type = 'NUMERIC' AND NEW.numeric_value IS NULL THEN
    RAISE EXCEPTION 'Numeric attribute requires numeric_value';
  ELSIF expected_type = 'TEXT' AND NEW.text_value IS NULL THEN
    RAISE EXCEPTION 'Text attribute requires text_value';
  ELSIF expected_type = 'BOOLEAN' AND NEW.boolean_value IS NULL THEN
    RAISE EXCEPTION 'Boolean attribute requires boolean_value';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_observation_attribute_context
BEFORE INSERT OR UPDATE ON statistics.observation_attribute_value
FOR EACH ROW EXECUTE FUNCTION statistics.enforce_observation_attribute_context();

CREATE OR REPLACE FUNCTION statistics.assert_revision_has_measure(target_revision_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM statistics.observation_revision
    WHERE observation_revision_id = target_revision_id
  ) AND NOT EXISTS (
    SELECT 1 FROM statistics.observation_measure
    WHERE observation_revision_id = target_revision_id
  ) THEN
    RAISE EXCEPTION 'Observation revision must contain at least one measure';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION statistics.enforce_revision_has_measure()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'observation_revision' THEN
    PERFORM statistics.assert_revision_has_measure(NEW.observation_revision_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM statistics.assert_revision_has_measure(OLD.observation_revision_id);
  ELSE
    PERFORM statistics.assert_revision_has_measure(NEW.observation_revision_id);
    IF TG_OP = 'UPDATE' AND OLD.observation_revision_id <> NEW.observation_revision_id THEN
      PERFORM statistics.assert_revision_has_measure(OLD.observation_revision_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_revision_requires_measure
AFTER INSERT OR UPDATE ON statistics.observation_revision
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION statistics.enforce_revision_has_measure();

CREATE CONSTRAINT TRIGGER trg_measure_preserves_revision_measure
AFTER INSERT OR UPDATE OR DELETE ON statistics.observation_measure
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION statistics.enforce_revision_has_measure();
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP TRIGGER IF EXISTS trg_measure_preserves_revision_measure ON statistics.observation_measure;
DROP TRIGGER IF EXISTS trg_revision_requires_measure ON statistics.observation_revision;
DROP FUNCTION IF EXISTS statistics.enforce_revision_has_measure();
DROP FUNCTION IF EXISTS statistics.assert_revision_has_measure(bigint);
DROP TRIGGER IF EXISTS trg_observation_attribute_context ON statistics.observation_attribute_value;
DROP FUNCTION IF EXISTS statistics.enforce_observation_attribute_context();
DROP TRIGGER IF EXISTS trg_observation_measure_context ON statistics.observation_measure;
DROP FUNCTION IF EXISTS statistics.enforce_observation_measure_context();
DROP TRIGGER IF EXISTS trg_observation_revision_context ON statistics.observation_revision;
DROP FUNCTION IF EXISTS statistics.enforce_observation_revision_context();
  `);
}
