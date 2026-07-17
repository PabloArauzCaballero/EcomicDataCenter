#!/bin/sh
set -eu

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is required}"
: "${BACKUP_DESTINATION:=/backups}"
: "${BACKUP_RETENTION_DAYS:=30}"

umask 077
mkdir -p "$BACKUP_DESTINATION"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$BACKUP_DESTINATION/observatorio-$timestamp.dump"
checksum="$output.sha256"

pg_dump --dbname="$BACKUP_DATABASE_URL" --format=custom --compress=9 --file="$output"
sha256sum "$output" > "$checksum"
find "$BACKUP_DESTINATION" -type f \( -name '*.dump' -o -name '*.sha256' \) \
  -mtime "+$BACKUP_RETENTION_DAYS" -delete
printf 'Backup completed: %s\n' "$output"
