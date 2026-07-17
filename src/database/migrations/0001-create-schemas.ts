import type { MigrationContext } from '../migration.types';

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE SCHEMA IF NOT EXISTS provenance;
CREATE SCHEMA IF NOT EXISTS semantic;
CREATE SCHEMA IF NOT EXISTS metadata;
CREATE SCHEMA IF NOT EXISTS statistics;
CREATE SCHEMA IF NOT EXISTS quality_lineage;
CREATE SCHEMA IF NOT EXISTS read_models;
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP SCHEMA IF EXISTS read_models CASCADE;
DROP SCHEMA IF EXISTS quality_lineage CASCADE;
DROP SCHEMA IF EXISTS statistics CASCADE;
DROP SCHEMA IF EXISTS metadata CASCADE;
DROP SCHEMA IF EXISTS semantic CASCADE;
DROP SCHEMA IF EXISTS provenance CASCADE;
  `);
}
