#!/bin/sh
set -eu

: "${DATABASE_WRITER_URL:?DATABASE_WRITER_URL is required}"
: "${DATABASE_READER_URL:?DATABASE_READER_URL is required}"
: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is required}"

query_scalar() {
  database_url=$1
  sql=$2
  psql --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --dbname "$database_url" --command "$sql" | tr -d '[:space:]'
}

assert_equals() {
  label=$1
  expected=$2
  actual=$3
  if [ "$actual" != "$expected" ]; then
    printf 'FAIL: %s — expected %s, received %s\n' "$label" "$expected" "$actual" >&2
    exit 1
  fi
  printf 'PASS: %s\n' "$label"
}

assert_equals \
  'writer can modify base tables' \
  't' \
  "$(query_scalar "$DATABASE_WRITER_URL" "SELECT has_table_privilege(current_user, 'statistics.observation', 'SELECT,INSERT,UPDATE,DELETE')")"

assert_equals \
  'writer cannot create objects in application schemas' \
  'f' \
  "$(query_scalar "$DATABASE_WRITER_URL" "SELECT has_schema_privilege(current_user, 'statistics', 'CREATE')")"

assert_equals \
  'writer can execute required integrity helpers' \
  't' \
  "$(query_scalar "$DATABASE_WRITER_URL" "SELECT has_function_privilege(current_user, 'statistics.assert_revision_has_measure(bigint)', 'EXECUTE')")"

assert_equals \
  'reader defaults to read-only transactions' \
  'on' \
  "$(query_scalar "$DATABASE_READER_URL" 'SHOW default_transaction_read_only')"

assert_equals \
  'reader can query the approved projection' \
  't' \
  "$(query_scalar "$DATABASE_READER_URL" "SELECT has_table_privilege(current_user, 'read_models.current_observation_value', 'SELECT')")"

assert_equals \
  'reader cannot modify observations' \
  'f' \
  "$(query_scalar "$DATABASE_READER_URL" "SELECT has_table_privilege(current_user, 'statistics.observation', 'INSERT,UPDATE,DELETE')")"

assert_equals \
  'reader cannot query non-whitelisted semantic tables' \
  'f' \
  "$(query_scalar "$DATABASE_READER_URL" "SELECT has_table_privilege(current_user, 'semantic.frequency', 'SELECT')")"

assert_equals \
  'reader cannot create objects in application schemas' \
  'f' \
  "$(query_scalar "$DATABASE_READER_URL" "SELECT has_schema_privilege(current_user, 'statistics', 'CREATE')")"

assert_equals \
  'reader cannot execute internal integrity helpers' \
  'f' \
  "$(query_scalar "$DATABASE_READER_URL" "SELECT has_function_privilege(current_user, 'statistics.assert_revision_has_measure(bigint)', 'EXECUTE')")"


assert_equals \
  'backup operator can read application tables' \
  't' \
  "$(query_scalar "$BACKUP_DATABASE_URL" "SELECT has_table_privilege(current_user, 'statistics.observation', 'SELECT')")"

assert_equals \
  'backup operator cannot modify application tables' \
  'f' \
  "$(query_scalar "$BACKUP_DATABASE_URL" "SELECT has_table_privilege(current_user, 'statistics.observation', 'INSERT,UPDATE,DELETE')")"

assert_equals \
  'backup operator cannot create objects in application schemas' \
  'f' \
  "$(query_scalar "$BACKUP_DATABASE_URL" "SELECT has_schema_privilege(current_user, 'statistics', 'CREATE')")"

printf 'PASS: PostgreSQL runtime privilege matrix verified.\n'
