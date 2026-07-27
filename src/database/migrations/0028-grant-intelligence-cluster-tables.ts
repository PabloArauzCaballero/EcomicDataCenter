import type { MigrationContext } from '../migration.types';

/**
 * Extends least privilege to the deduplication tables.
 *
 * Grants are enumerated per table rather than applied to the whole schema so a
 * table added later is never silently writable before it has been reviewed.
 */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_writer') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      intelligence.document_cluster,
      intelligence.claim_cluster_member
      TO backend_writer;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA intelligence TO backend_writer;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_reader') THEN
    GRANT SELECT ON TABLE
      intelligence.document_cluster,
      intelligence.claim_cluster_member
      TO backend_reader;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
    GRANT SELECT ON TABLE
      intelligence.document_cluster,
      intelligence.claim_cluster_member
      TO backup_operator;
  END IF;
END;
$$;
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
    REVOKE ALL PRIVILEGES ON TABLE
      intelligence.document_cluster, intelligence.claim_cluster_member FROM backup_operator;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_reader') THEN
    REVOKE ALL PRIVILEGES ON TABLE
      intelligence.document_cluster, intelligence.claim_cluster_member FROM backend_reader;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_writer') THEN
    REVOKE ALL PRIVILEGES ON TABLE
      intelligence.document_cluster, intelligence.claim_cluster_member FROM backend_writer;
  END IF;
END;
$$;
  `);
}
