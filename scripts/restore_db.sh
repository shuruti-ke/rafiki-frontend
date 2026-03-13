#!/usr/bin/env bash
# PostgreSQL restore script for Rafiki.
# Requires: DATABASE_URL in environment, psql and gunzip in PATH.
# Usage: ./scripts/restore_db.sh <backup_file.sql.gz>
# WARNING: This overwrites the target database. Use only for disaster recovery or staging restores.

set -e

BACKUP_FILE="${1:?Usage: $0 <backup_file.sql.gz>}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

if [[ -z "$DATABASE_URL" ]]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

echo "Restoring from $BACKUP_FILE to DATABASE_URL..."
gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL" --set ON_ERROR_STOP=on
echo "Restore complete."
