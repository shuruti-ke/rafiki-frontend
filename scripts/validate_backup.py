#!/usr/bin/env python3
"""Validate a backup file is readable and contains SQL. Usage: python scripts/validate_backup.py <file.sql.gz>"""
import gzip
import sys
from pathlib import Path


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/validate_backup.py <backup_file.sql.gz>", file=sys.stderr)
        sys.exit(1)
    path = Path(sys.argv[1])
    if not path.exists():
        print(f"File not found: {path}", file=sys.stderr)
        sys.exit(1)
    try:
        with gzip.open(path, "rt", encoding="utf-8", errors="replace") as f:
            head = f.read(2000)
        if "CREATE TABLE" in head or "COPY " in head or "--" in head:
            print(f"OK: {path} is a valid backup ({path.stat().st_size / 1024:.1f} KB)")
        else:
            print(f"WARN: {path} may not be a valid pg_dump (no CREATE TABLE/COPY found)", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
