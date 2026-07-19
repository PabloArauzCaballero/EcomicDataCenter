import type { MigrationContext } from '../migration.types';

const APPLICATION_SCHEMAS =
  'provenance, semantic, metadata, statistics, quality_lineage, read_models, infrastructure';

/** Grants a dedicated backup role read-only access required by pg_dump. */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
    GRANT USAGE ON SCHEMA ${APPLICATION_SCHEMAS} TO backup_operator;
    GRANT SELECT ON ALL TABLES IN SCHEMA ${APPLICATION_SCHEMAS} TO backup_operator;
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA
      provenance, semantic, metadata, statistics, quality_lineage
      TO backup_operator;
    REVOKE CREATE ON SCHEMA ${APPLICATION_SCHEMAS} FROM backup_operator;

    ALTER DEFAULT PRIVILEGES IN SCHEMA
      provenance, semantic, metadata, statistics, quality_lineage, read_models, infrastructure
      GRANT SELECT ON TABLES TO backup_operator;
    ALTER DEFAULT PRIVILEGES IN SCHEMA
      provenance, semantic, metadata, statistics, quality_lineage
      GRANT SELECT ON SEQUENCES TO backup_operator;
  END IF;
END
$$;
  `);
}

/** Revokes application-object read access from the backup group role. */
export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA
      provenance, semantic, metadata, statistics, quality_lineage, read_models, infrastructure
      REVOKE SELECT ON TABLES FROM backup_operator;
    ALTER DEFAULT PRIVILEGES IN SCHEMA
      provenance, semantic, metadata, statistics, quality_lineage
      REVOKE SELECT ON SEQUENCES FROM backup_operator;

    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${APPLICATION_SCHEMAS}
      FROM backup_operator;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA
      provenance, semantic, metadata, statistics, quality_lineage
      FROM backup_operator;
    REVOKE USAGE ON SCHEMA ${APPLICATION_SCHEMAS} FROM backup_operator;
  END IF;
END
$$;
  `);
}
