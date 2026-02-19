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
from app.routers.auth import _hash_password

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPER_ADMIN_EMAIL = "admin@shoulder2leanon.com"
SUPER_ADMIN_PASSWORD = "Rafiki@2026!"
SUPER_ADMIN_NAME = "Platform Admin"
DEFAULT_ORG_NAME = "Shoulder2LeanOn"
DEFAULT_ORG_CODE = "s2lo"


def seed_super_admin(db):
    """Create the default org and super admin user if they don't exist."""
    # Ensure default org
    org = db.query(Organization).filter(Organization.code == DEFAULT_ORG_CODE).first()
    if not org:
        org = Organization(name=DEFAULT_ORG_NAME, code=DEFAULT_ORG_CODE)
        db.add(org)
        db.flush()
        logger.info("Created default organization: %s (%s)", DEFAULT_ORG_NAME, DEFAULT_ORG_CODE)
    else:
        logger.info("Default organization already exists, skipping.")

    # Ensure super admin user
    user = db.query(User).filter(User.email == SUPER_ADMIN_EMAIL).first()
    if not user:
        user = User(
            email=SUPER_ADMIN_EMAIL,
            password_hash=_hash_password(SUPER_ADMIN_PASSWORD),
            full_name=SUPER_ADMIN_NAME,
            role="super_admin",
            org_id=org.id,
            is_active=True,
        )
        db.add(user)
        db.commit()
        logger.info("Created super admin: %s (%s)", SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL)
        logger.info("  Password: %s", SUPER_ADMIN_PASSWORD)
        logger.info("  >>> CHANGE THIS PASSWORD AFTER FIRST LOGIN <<<")
    else:
        logger.info("Super admin user already exists, skipping.")


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

        # 3. Seed super admin user and default org
        seed_super_admin(db)

        logger.info("Seed complete.")
    except Exception:
        logger.exception("Seed failed")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
