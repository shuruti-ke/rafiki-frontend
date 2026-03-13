#!/usr/bin/env python3
"""
Cross-platform PostgreSQL backup script for Rafiki.
Uses pg_dump via subprocess. Requires PostgreSQL client tools (pg_dump) in PATH.
Usage: python scripts/backup_db.py [output_dir]
"""
import gzip
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path


def main():
    output_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("./backups")
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = output_dir / f"rafiki_backup_{timestamp}.sql.gz"

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL is not set", file=sys.stderr)
        sys.exit(1)

    result = subprocess.run(
        ["pg_dump", db_url, "--no-owner", "--no-acl"],
        capture_output=True,
        text=False,
    )
    if result.returncode != 0:
        print(result.stderr.decode(errors="replace"), file=sys.stderr)
        sys.exit(result.returncode)

    with gzip.open(output_file, "wb") as f:
        f.write(result.stdout)

    print(f"Backup written to: {output_file}")
    print(f"Size: {output_file.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
