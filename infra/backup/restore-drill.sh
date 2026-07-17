#!/bin/sh
set -eu

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"

checksum_file="$BACKUP_FILE.sha256"
[ -f "$checksum_file" ] || { echo "Missing checksum: $checksum_file" >&2; exit 1; }
(cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$checksum_file")")
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$RESTORE_DATABASE_URL" "$BACKUP_FILE"
psql "$RESTORE_DATABASE_URL" --set=ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
SELECT count(*) AS migration_count FROM infrastructure.migration_history;
SELECT count(*) AS dataset_count FROM metadata.dataset;
SELECT count(*) AS current_revision_count
FROM statistics.observation_revision
WHERE is_current = true;
ROLLBACK;
SQL
printf 'Restore drill completed for %s\n' "$BACKUP_FILE"
