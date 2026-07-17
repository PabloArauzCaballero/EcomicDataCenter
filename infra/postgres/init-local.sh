#!/bin/sh
set -eu

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${MIGRATOR_PASSWORD:?MIGRATOR_PASSWORD is required}"
: "${WRITER_PASSWORD:?WRITER_PASSWORD is required}"
: "${READER_PASSWORD:?READER_PASSWORD is required}"
: "${BACKUP_PASSWORD:?BACKUP_PASSWORD is required}"

psql \
  --set=ON_ERROR_STOP=1 \
  --set=database_name="$POSTGRES_DB" \
  --set=migrator_password="$MIGRATOR_PASSWORD" \
  --set=writer_password="$WRITER_PASSWORD" \
  --set=reader_password="$READER_PASSWORD" \
  --set=backup_password="$BACKUP_PASSWORD" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<'SQL'
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

GRANT backend_migrator TO observatory_migrator;
GRANT backend_writer TO observatory_writer;
GRANT backend_reader TO observatory_reader;
GRANT backup_operator TO observatory_backup;

ALTER ROLE observatory_reader SET default_transaction_read_only = on;
ALTER ROLE observatory_migrator IN DATABASE :"database_name" SET search_path = pg_catalog;
ALTER ROLE observatory_writer IN DATABASE :"database_name" SET search_path = pg_catalog;
ALTER ROLE observatory_reader IN DATABASE :"database_name" SET search_path = pg_catalog;

REVOKE CREATE ON DATABASE :"database_name" FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT, CREATE ON DATABASE :"database_name" TO backend_migrator;
GRANT CONNECT ON DATABASE :"database_name" TO backend_writer, backend_reader, backup_operator;
SQL
