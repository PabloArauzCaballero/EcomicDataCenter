import type { MigrationContext } from '../migration.types';

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_writer') THEN
    GRANT USAGE ON SCHEMA provenance, semantic, metadata, statistics, quality_lineage TO backend_writer;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage TO backend_writer;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage TO backend_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_reader') THEN
    GRANT USAGE ON SCHEMA read_models TO backend_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA read_models TO backend_reader;
    GRANT USAGE ON SCHEMA provenance, semantic, metadata, statistics, quality_lineage TO backend_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage TO backend_reader;
  END IF;
END
$$;
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_writer') THEN
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage FROM backend_writer;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA provenance, semantic, metadata, statistics, quality_lineage FROM backend_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_reader') THEN
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA read_models, provenance, semantic, metadata, statistics, quality_lineage FROM backend_reader;
  END IF;
END
$$;
  `);
}
