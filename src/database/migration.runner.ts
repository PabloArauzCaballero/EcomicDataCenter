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

  const migrator = new Umzug({
    migrations: { glob: ['migrations/*.{js,ts}', { cwd: __dirname }] },
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
 * Repairs the one known legacy baseline created before migration metadata was
 * persisted. It never guesses from a single table: every object created by
 * migration 0002 must exist before the migration is recorded as executed.
 */
export async function reconcileLegacyMigrationHistory(
  database: Sequelize,
  migrator: Umzug<{ sequelize: Sequelize }>,
): Promise<void> {
  const pending = await migrator.pending();
  const provenanceMigration = pending.find((item) =>
    item.name.startsWith('0002-create-provenance-tables.'),
  );
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
