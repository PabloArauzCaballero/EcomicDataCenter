import { QueryTypes, Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import type { Environment } from '../config/environment';

const MIGRATION_LOCK_SQL = `
SELECT pg_advisory_lock(
  hashtextextended(current_database() || ':observatorio-economico:migrations', 0)
)`;
const MIGRATION_UNLOCK_SQL = `
SELECT pg_advisory_unlock(
  hashtextextended(current_database() || ':observatorio-economico:migrations', 0)
)`;

const LEGACY_PROVENANCE_TABLES = [
  'provenance.organization',
  'provenance.source',
  'provenance.source_artifact',
  'provenance.data_entry_batch',
] as const;

const LEGACY_PROVENANCE_MIGRATION = '0002-create-provenance-tables';
const MIGRATION_HISTORY_TABLE = 'infrastructure.migration_history';
const MIGRATION_EXTENSION = /\.(?:js|ts)$/;

/**
 * Identifies a migration by file name without its extension.
 *
 * The same migration ships as TypeScript in `src` and as JavaScript in `dist`,
 * so the extension describes how the process was started, not which change was
 * applied. Recording it would split one history in two.
 */
export function migrationName(fileName: string): string {
  return fileName.replace(MIGRATION_EXTENSION, '');
}

export async function createMigrationRunner(environment: Environment): Promise<{
  database: Sequelize;
  migrator: Umzug<{ sequelize: Sequelize }>;
}> {
  const connectionUrl = environment.DATABASE_MIGRATOR_URL ?? environment.DATABASE_WRITER_URL;
  const database = new Sequelize(connectionUrl, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: environment.DATABASE_SSL
      ? { ssl: { require: true, rejectUnauthorized: true } }
      : {},
    pool: { max: 1, min: 0, acquire: environment.DATABASE_POOL_ACQUIRE_MS, idle: 1_000 },
    retry: { max: 0 },
  });
  await database.authenticate();

  // Umzug needs its metadata schema before it can determine pending migrations.
  // This is the only bootstrap DDL outside a versioned migration.
  await database.query('CREATE SCHEMA IF NOT EXISTS infrastructure');

  await normalizeMigrationHistoryNames(database);

  const migrator = new Umzug({
    migrations: {
      glob: ['migrations/*.{js,ts}', { cwd: __dirname }],
      // Only the recorded name changes; loading stays with Umzug's own resolver.
      resolve: (parameters) => ({
        ...Umzug.defaultResolver(parameters),
        name: migrationName(parameters.name),
      }),
    },
    context: { sequelize: database },
    storage: new SequelizeStorage({
      sequelize: database,
      tableName: 'migration_history',
      schema: 'infrastructure',
    }),
    logger: undefined,
  });
  return { database, migrator };
}

/**
 * Collapses history rows that were recorded with a file extension.
 *
 * Until the resolver above normalized them, the runner stored whatever the glob
 * matched: `0001-create-schemas.ts` when started from source through tsx, and
 * `0001-create-schemas.js` when started from `dist` on a deployed instance.
 * Neither history recognized the other, so a deployment replayed the entire
 * chain and stopped at the first migration that is not idempotent.
 *
 * Runs before Umzug reads its metadata, and is a no-op once the history is
 * clean or on a database that has never been migrated.
 */
export async function normalizeMigrationHistoryNames(database: Sequelize): Promise<void> {
  const [table] = await database.query<{ relation: string | null }>(
    `SELECT to_regclass('${MIGRATION_HISTORY_TABLE}')::text AS relation`,
    { type: QueryTypes.SELECT },
  );
  if (!table?.relation) return;

  await database.query(
    `INSERT INTO ${MIGRATION_HISTORY_TABLE} (name)
     SELECT DISTINCT regexp_replace(name, '\\.(js|ts)$', '')
       FROM ${MIGRATION_HISTORY_TABLE}
      WHERE name ~ '\\.(js|ts)$'
     ON CONFLICT (name) DO NOTHING`,
  );
  await database.query(`DELETE FROM ${MIGRATION_HISTORY_TABLE} WHERE name ~ '\\.(js|ts)$'`);
}

/**
 * Repairs the one known legacy baseline created before migration metadata was
 * persisted. It never guesses from a single table: every object created by
 * migration 0002 must exist before the migration is recorded as executed.
 */
export async function reconcileLegacyMigrationHistory(
  database: Sequelize,
  migrator: Umzug<{ sequelize: Sequelize }>,
): Promise<void> {
  const pending = await migrator.pending();
  const provenanceMigration = pending.find((item) => item.name === LEGACY_PROVENANCE_MIGRATION);
  if (!provenanceMigration) return;

  const rows = await database.query<{ relation_name: string; relation: string | null }>(
    `SELECT relation_name, to_regclass(relation_name) AS relation
       FROM unnest(ARRAY[:tables]::text[]) AS item(relation_name)`,
    {
      replacements: { tables: [...LEGACY_PROVENANCE_TABLES] },
      type: QueryTypes.SELECT,
    },
  );
  const existing = rows.filter((row) => row.relation !== null).map((row) => row.relation_name);
  if (existing.length === 0) return;
  if (existing.length !== LEGACY_PROVENANCE_TABLES.length) {
    throw new Error(
      `Unsafe partial provenance baseline; found ${existing.join(', ')}. Repair the schema before migrating.`,
    );
  }

  await database.query(
    `INSERT INTO infrastructure.migration_history (name)
     VALUES (:name)
     ON CONFLICT (name) DO NOTHING`,
    { replacements: { name: provenanceMigration.name } },
  );
}

/** Serializes migration commands across replicas using a PostgreSQL advisory lock. */
export async function withMigrationLock<T>(
  database: Sequelize,
  action: () => Promise<T>,
): Promise<T> {
  await database.query(MIGRATION_LOCK_SQL);
  try {
    return await action();
  } finally {
    await database.query(MIGRATION_UNLOCK_SQL);
  }
}
