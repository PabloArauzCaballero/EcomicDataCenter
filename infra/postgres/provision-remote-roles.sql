-- Idempotent role provisioning for an already-existing remote PostgreSQL
-- database (e.g. Neon). Run with an account that may create roles; on Neon the
-- project owner (neondb_owner) qualifies. Unlike infra/postgres/init-local.sh
-- this script never creates a database and never assumes superuser.
--
-- Login-role passwords are injected by scripts/provision-remote-roles.ts using
-- server-side format(%L) escaping; when running by hand replace the :'*_password'
-- psql variables or use that runner.

-- 1. Group roles referenced by the versioned grant migrations (0009/0014/0016).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_migrator') THEN
    CREATE ROLE backend_migrator
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_writer') THEN
    CREATE ROLE backend_writer
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backend_reader') THEN
    CREATE ROLE backend_reader
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
    CREATE ROLE backup_operator
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

-- 2. Least-privilege login roles that inherit the group roles above.
--    (Password statements are emitted by the runner; see the header note.)
SELECT format(
  'CREATE ROLE observatory_migrator LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'migrator_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'observatory_migrator') \gexec
SELECT format('ALTER ROLE observatory_migrator PASSWORD %L', :'migrator_password') \gexec

SELECT format(
  'CREATE ROLE observatory_writer LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'writer_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'observatory_writer') \gexec
SELECT format('ALTER ROLE observatory_writer PASSWORD %L', :'writer_password') \gexec

SELECT format(
  'CREATE ROLE observatory_reader LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'reader_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'observatory_reader') \gexec
SELECT format('ALTER ROLE observatory_reader PASSWORD %L', :'reader_password') \gexec

SELECT format(
  'CREATE ROLE observatory_backup LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'backup_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'observatory_backup') \gexec
SELECT format('ALTER ROLE observatory_backup PASSWORD %L', :'backup_password') \gexec

-- 3. Membership + connection grants (all idempotent).
GRANT backend_migrator TO observatory_migrator;
GRANT backend_writer TO observatory_writer;
GRANT backend_reader TO observatory_reader;
GRANT backup_operator TO observatory_backup;

ALTER ROLE observatory_reader SET default_transaction_read_only = on;
