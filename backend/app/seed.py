"""
Seed script for Rafiki@Work — populates essential data on first deploy.

Run: python -m app.seed
"""
import logging
import sys

from app.database import SessionLocal
from app.services.seed_modules import seed_canonical_modules
from app.services.toolkit_service import seed_default_modules
from app.models.user import Organization, User
from app.services.auth import hash_password

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def seed_org_and_admin(db):
    """Create default org and super_admin user if they don't exist."""
    org = db.query(Organization).filter(Organization.name == "Shoulder2LeanOn").first()
    if not org:
        org = Organization(name="Shoulder2LeanOn", code="s2lo")
        db.add(org)
        db.flush()
        logger.info("Created org: Shoulder2LeanOn (id=%s)", org.id)
    else:
        logger.info("Org 'Shoulder2LeanOn' already exists (id=%s), skipping.", org.id)

    admin = db.query(User).filter(User.email == "admin@shoulder2leanon.com").first()
    if not admin:
        admin = User(
            email="admin@shoulder2leanon.com",
            hashed_password=hash_password("admin123"),
            full_name="Rafiki Admin",
            role="super_admin",
            org_id=org.id,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        logger.info("Created admin user: admin@shoulder2leanon.com (id=%s)", admin.id)
    else:
        logger.info("Admin user already exists (id=%s), skipping.", admin.id)


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

        # 3. Seed default org and admin user
        seed_org_and_admin(db)

        logger.info("Seed complete.")
    except Exception:
        logger.exception("Seed failed")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
