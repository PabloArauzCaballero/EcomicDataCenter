import { Sequelize } from 'sequelize';
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
