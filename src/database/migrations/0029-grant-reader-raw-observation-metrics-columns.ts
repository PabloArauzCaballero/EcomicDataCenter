import type { MigrationContext } from '../migration.types';

/**
 * Lets the domain metrics collector read raw-observation state without exposing
 * the untrusted payload.
 *
 * The collector runs on the reader pool and counts dead-letters and ingestion
 * lag from intelligence.raw_observation, but 0025 isolates that landing zone
 * from the reader entirely, so every collection failed with "permission denied"
 * and left the domain gauges empty. A column-level grant on only the two
 * operational columns the query needs keeps the untrusted payload_json (and the
 * free-text reason columns) unreadable by the read path while restoring metrics.
 */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_reader') THEN
    GRANT SELECT (processing_status, received_at)
      ON TABLE intelligence.raw_observation TO backend_reader;
  END IF;
END;
$$;
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_reader') THEN
    REVOKE SELECT (processing_status, received_at)
      ON TABLE intelligence.raw_observation FROM backend_reader;
  END IF;
END;
$$;
  `);
}
