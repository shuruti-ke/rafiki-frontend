#!/usr/bin/env bash
# PostgreSQL backup script for Rafiki.
# Requires: DATABASE_URL in environment, pg_dump in PATH.
# Usage: ./scripts/backup_db.sh [output_dir]
# Output: output_dir/rafiki_backup_YYYYMMDD_HHMMSS.sql.gz

set -e

OUTPUT_DIR="${1:-./backups}"
mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="$OUTPUT_DIR/rafiki_backup_${TIMESTAMP}.sql.gz"

if [[ -z "$DATABASE_URL" ]]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip > "$OUTPUT_FILE"

echo "Backup written to: $OUTPUT_FILE"
ls -la "$OUTPUT_FILE"
