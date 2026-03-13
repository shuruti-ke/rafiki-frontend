# Database Backup and Restore

This document describes how to back up and restore the Rafiki PostgreSQL database. **When clients start paying, move the database off the free tier** and enable automated backups on your managed PostgreSQL provider.

## Prerequisites

- `pg_dump` and `psql` (PostgreSQL client tools) in PATH, or
- Python 3 with `pg_dump` in PATH for the Python backup script

## Backup

### Option A: Shell script (Linux/macOS/WSL)

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/dbname"
./scripts/backup_db.sh ./backups
```

### Option B: Python script (cross-platform)

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/dbname"
python scripts/backup_db.py ./backups
```

### Option C: Manual pg_dump

```bash
pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip > rafiki_backup_$(date +%Y%m%d).sql.gz
```

## Restore

**WARNING:** Restore overwrites the target database. Use only for disaster recovery or restoring into a staging database.

### Shell script

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/staging_db"
./scripts/restore_db.sh ./backups/rafiki_backup_20250313_120000.sql.gz
```

### Manual restore

```bash
gunzip -c rafiki_backup_20250313.sql.gz | psql "$DATABASE_URL" --set ON_ERROR_STOP=on
```

## Validate a backup file

```bash
python scripts/validate_backup.py ./backups/rafiki_backup_20250313_120000.sql.gz
```

## Restore Test Procedure

Run a monthly restore test to verify backups are valid:

1. Create a staging database (or use a dedicated restore-test DB).
2. Run restore:
   ```bash
   export DATABASE_URL="postgresql://...staging..."
   ./scripts/restore_db.sh ./backups/rafiki_backup_LATEST.sql.gz
   ```
3. Run migrations if needed: `alembic upgrade head`
4. Smoke test: hit `/health/ready` and verify login works.
5. Document the test date and outcome.

## Retention Policy (when on paid tier)

- Keep at least **7 daily** backups
- Keep **4 weekly** backups
- Document RPO (Recovery Point Objective) and RTO (Recovery Time Objective)

## Render / Managed PostgreSQL

- **Free tier:** No automated backups. Run manual backups before deploys.
- **Paid tier:** Enable daily automated backups in the Render dashboard. Test restores monthly.
