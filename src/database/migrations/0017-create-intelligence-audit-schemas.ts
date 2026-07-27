import type { MigrationContext } from '../migration.types';

/**
 * Adds the two schemas that carry the intelligence layer.
 *
 * `intelligence` holds untrusted agent input and the qualitative evidence model.
 * `audit` is kept separate so its privileges can be reduced to append-only
 * without weakening the grants that runtime tables require.
 */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE SCHEMA IF NOT EXISTS intelligence;
CREATE SCHEMA IF NOT EXISTS audit;
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP SCHEMA IF EXISTS audit CASCADE;
DROP SCHEMA IF EXISTS intelligence CASCADE;
  `);
}
