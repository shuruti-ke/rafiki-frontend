"""
Seed script for Rafiki@Work — populates essential data on first deploy.

Run: python -m app.seed
"""
import logging
import sys

from app.database import SessionLocal
from app.services.seed_modules import seed_canonical_modules
from app.services.toolkit_service import seed_default_modules

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_seed():
    db = SessionLocal()
    try:
        # 1. Seed guided-path modules (burnout check, breathing reset, stress decompress)
        created_gp = seed_canonical_modules(db)
        if created_gp:
            logger.info("Seeded %d guided-path modules: %s", len(created_gp), [m["name"] for m in created_gp])
        else:
            logger.info("Guided-path modules already exist, skipping.")

        # 2. Seed default toolkit modules (coaching, PIP, conflict, etc.)
        created_tk = seed_default_modules(db)
        if created_tk:
            logger.info("Seeded %d toolkit modules.", created_tk)
        else:
            logger.info("Toolkit modules already exist, skipping.")

        logger.info("Seed complete.")
    except Exception:
        logger.exception("Seed failed")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
