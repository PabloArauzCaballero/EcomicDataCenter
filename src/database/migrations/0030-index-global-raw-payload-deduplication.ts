import type { MigrationContext } from '../migration.types';

/** Supports cross-run duplicate detection without rewriting historical rows. */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE INDEX ix_raw_observation_payload_hash_global
  ON intelligence.raw_observation (payload_hash, raw_observation_id);
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP INDEX IF EXISTS intelligence.ix_raw_observation_payload_hash_global;
  `);
}
