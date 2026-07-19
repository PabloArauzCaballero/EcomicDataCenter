import 'dotenv/config';
import { QueryTypes, Sequelize } from 'sequelize';

/**
 * Idempotently provisions the group and login roles the runtime grant
 * migrations depend on, against an already-existing remote database (Neon).
 * Safe to run repeatedly: every role is created only when absent and every
 * grant is a no-op when already present. Requires a connection whose user may
 * create roles (on Neon the project owner qualifies).
 */

interface LoginRole {
  readonly login: string;
  readonly group: string;
  readonly password: string;
  readonly readOnly?: boolean;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const GROUP_ROLES = [
  'backend_migrator',
  'backend_writer',
  'backend_reader',
  'backup_operator',
] as const;

async function ensureGroupRole(database: Sequelize, role: string): Promise<void> {
  // Role names here are compile-time constants, never user input.
  await database.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
    CREATE ROLE ${role}
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;`);
}

async function ensureLoginRole(database: Sequelize, role: LoginRole): Promise<void> {
  // format(%L) escapes the password server-side; the WHERE NOT EXISTS makes
  // creation idempotent. ALTER ROLE then re-syncs the password unconditionally.
  const created = await database.query<{ ddl: string }>(
    `SELECT format(
       'CREATE ROLE ${role.login} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
       :password
     ) AS ddl
     WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role.login}')`,
    { type: QueryTypes.SELECT, replacements: { password: role.password } },
  );
  if (created[0]) {
    await database.query(created[0].ddl);
  }
  const altered = await database.query<{ ddl: string }>(
    `SELECT format('ALTER ROLE ${role.login} PASSWORD %L', :password) AS ddl`,
    { type: QueryTypes.SELECT, replacements: { password: role.password } },
  );
  if (altered[0]) {
    await database.query(altered[0].ddl);
  }

  await database.query(`GRANT ${role.group} TO ${role.login}`);
  if (role.readOnly) {
    await database.query(`ALTER ROLE ${role.login} SET default_transaction_read_only = on`);
  }
}

async function main(): Promise<void> {
  const connectionUrl = process.env.DATABASE_MIGRATOR_URL ?? requireEnv('DATABASE_WRITER_URL');
  const loginRoles: readonly LoginRole[] = [
    { login: 'observatory_migrator', group: 'backend_migrator', password: requireEnv('MIGRATOR_PASSWORD') },
    { login: 'observatory_writer', group: 'backend_writer', password: requireEnv('WRITER_PASSWORD') },
    { login: 'observatory_reader', group: 'backend_reader', password: requireEnv('READER_PASSWORD'), readOnly: true },
    { login: 'observatory_backup', group: 'backup_operator', password: requireEnv('BACKUP_PASSWORD') },
  ];

  const database = new Sequelize(connectionUrl, {
    dialect: 'postgres',
    logging: false,
    dialectOptions:
      (process.env.DATABASE_SSL ?? 'false') === 'true'
        ? { ssl: { require: true, rejectUnauthorized: true } }
        : {},
    pool: { max: 1, min: 0, acquire: 15_000, idle: 1_000 },
    retry: { max: 0 },
  });

  try {
    await database.authenticate();
    const identity = await database.query<{ db: string; who: string }>(
      'SELECT current_database() AS db, current_user AS who',
      { type: QueryTypes.SELECT },
    );
    const db = identity[0]?.db ?? '';
    if (db.length === 0) {
      throw new Error('Could not resolve the current database name');
    }
    process.stdout.write(`Connected to "${db}" as "${identity[0]?.who ?? 'unknown'}".\n`);

    for (const groupRole of GROUP_ROLES) {
      await ensureGroupRole(database, groupRole);
      process.stdout.write(`  group role ready: ${groupRole}\n`);
    }
    for (const login of loginRoles) {
      await ensureLoginRole(database, login);
      process.stdout.write(`  login role ready: ${login.login} -> ${login.group}\n`);
    }

    const identifier = db.replace(/"/g, '""');
    await database.query(`GRANT CONNECT ON DATABASE "${identifier}" TO backend_migrator`);
    await database.query(
      `GRANT CONNECT ON DATABASE "${identifier}" TO backend_writer, backend_reader, backup_operator`,
    );
    process.stdout.write('  connect privileges granted\n');

    process.stdout.write('Role provisioning complete.\n');
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Role provisioning failed'}\n`);
  process.exitCode = 1;
});
