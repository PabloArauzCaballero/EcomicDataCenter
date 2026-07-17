import type { MigrationContext } from '../migration.types';

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
ALTER VIEW read_models.current_observation_value SET (security_barrier = true);

REVOKE ALL ON SCHEMA provenance, semantic, metadata, statistics, quality_lineage, read_models FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_writer') THEN
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage, read_models FROM backend_writer;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage FROM backend_writer;
    REVOKE CREATE ON SCHEMA provenance, semantic, metadata, statistics, quality_lineage, read_models FROM backend_writer;

    GRANT USAGE ON SCHEMA provenance, semantic, metadata, statistics, quality_lineage TO backend_writer;
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON ALL TABLES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage
      TO backend_writer;
    GRANT USAGE, SELECT
      ON ALL SEQUENCES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage
      TO backend_writer;
    GRANT EXECUTE ON FUNCTION
      semantic.enforce_classification_parent_version(),
      semantic.enforce_code_item_parent_list(),
      provenance.reject_source_artifact_mutation(),
      statistics.enforce_series_indicator_membership(),
      statistics.enforce_series_dimension_context(),
      statistics.enforce_observation_revision_context(),
      statistics.enforce_observation_measure_context(),
      statistics.enforce_observation_attribute_context(),
      statistics.assert_revision_has_measure(bigint),
      statistics.enforce_revision_has_measure()
      TO backend_writer;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_reader') THEN
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage, read_models FROM backend_reader;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage FROM backend_reader;
    REVOKE CREATE ON SCHEMA provenance, semantic, metadata, statistics, quality_lineage, read_models FROM backend_reader;

    GRANT USAGE ON SCHEMA provenance, metadata, statistics, quality_lineage, read_models TO backend_reader;
    GRANT SELECT ON TABLE
      provenance.organization,
      provenance.source,
      provenance.source_artifact,
      provenance.data_entry_batch,
      metadata.dataset,
      metadata.dataset_version,
      metadata.methodology_version,
      metadata.dimension_definition,
      metadata.measure_definition,
      metadata.attribute_definition,
      statistics.series,
      statistics.series_dimension_value,
      statistics.observation,
      statistics.observation_revision,
      statistics.observation_measure,
      statistics.observation_attribute_value,
      quality_lineage.quality_assessment,
      quality_lineage.data_issue,
      quality_lineage.lineage_relation,
      quality_lineage.series_break,
      read_models.current_observation_value
      TO backend_reader;
  END IF;
END
$$;
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
ALTER VIEW read_models.current_observation_value RESET (security_barrier);
ALTER DEFAULT PRIVILEGES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage TO PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_writer') THEN
    GRANT USAGE ON SCHEMA provenance, semantic, metadata, statistics, quality_lineage TO backend_writer;
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON ALL TABLES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage
      TO backend_writer;
    GRANT USAGE, SELECT
      ON ALL SEQUENCES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage
      TO backend_writer;
    GRANT EXECUTE ON FUNCTION
      semantic.enforce_classification_parent_version(),
      semantic.enforce_code_item_parent_list(),
      provenance.reject_source_artifact_mutation(),
      statistics.enforce_series_indicator_membership(),
      statistics.enforce_series_dimension_context(),
      statistics.enforce_observation_revision_context(),
      statistics.enforce_observation_measure_context(),
      statistics.enforce_observation_attribute_context(),
      statistics.assert_revision_has_measure(bigint),
      statistics.enforce_revision_has_measure()
      TO backend_writer;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_reader') THEN
    GRANT USAGE ON SCHEMA provenance, semantic, metadata, statistics, quality_lineage, read_models TO backend_reader;
    GRANT SELECT
      ON ALL TABLES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage, read_models
      TO backend_reader;
  END IF;
END
$$;
  `);
}
