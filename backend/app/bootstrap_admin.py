"""
Secure one-time bootstrap flow for the first super admin.

Usage examples:
  python -m app.bootstrap_admin --email owner@example.com --password "StrongPass123!" --name "Platform Owner" --org-name "Acme" --org-code "acme"
  BOOTSTRAP_SUPER_ADMIN_EMAIL=owner@example.com BOOTSTRAP_SUPER_ADMIN_PASSWORD=... python -m app.bootstrap_admin
"""

import argparse
import getpass
import logging
import os
import re
import sys

from app.database import SessionLocal
from app.models.user import Organization, User
from app.routers.auth import _hash_password

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _env_or_arg(value: str | None, env_key: str) -> str:
    return (value or os.getenv(env_key) or "").strip()


def _validate_password(password: str) -> None:
    if len(password) < 12:
        raise ValueError("Bootstrap password must be at least 12 characters long.")


def _validate_email(email: str) -> str:
    cleaned = email.strip().lower()
    if "@" not in cleaned or "." not in cleaned.split("@")[-1]:
        raise ValueError("A valid super admin email address is required.")
    return cleaned


def _validate_org_code(code: str) -> str:
    cleaned = code.strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,48}[a-z0-9]", cleaned):
        raise ValueError("Org code must be 3-50 characters using lowercase letters, numbers, or hyphens.")
    return cleaned


def bootstrap_super_admin(email: str, password: str, name: str, org_name: str, org_code: str) -> None:
    db = SessionLocal()
    try:
        org = db.query(Organization).filter(Organization.org_code == org_code).first()
        if not org:
            org = Organization(name=org_name, org_code=org_code, is_active=True)
            db.add(org)
            db.flush()
            logger.info("Created bootstrap organization: %s (%s)", org.name, org.org_code)

        user = db.query(User).filter(User.email == email).first()
        if user:
            if str(user.role) != "super_admin":
                raise ValueError(f"User {email} already exists with role {user.role}; refusing to repurpose automatically.")
            logger.info("Super admin already exists for %s. No new credentials were created.", email)
            db.rollback()
            return

        user = User(
            email=email,
            password_hash=_hash_password(password),
            name=name,
            role="super_admin",
            org_id=org.org_id,
            is_active=True,
        )
        db.add(user)
        db.commit()
        logger.info("Created bootstrap super admin %s for org %s.", email, org.org_code)
        logger.info("Store the credentials securely and rotate the password after first sign-in.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the first super admin securely.")
    parser.add_argument("--email")
    parser.add_argument("--password")
    parser.add_argument("--name")
    parser.add_argument("--org-name")
    parser.add_argument("--org-code")
    args = parser.parse_args()

    try:
        email = _validate_email(_env_or_arg(args.email, "BOOTSTRAP_SUPER_ADMIN_EMAIL"))
        password = _env_or_arg(args.password, "BOOTSTRAP_SUPER_ADMIN_PASSWORD")
        if not password and sys.stdin.isatty():
            password = getpass.getpass("Bootstrap super admin password: ")
        _validate_password(password)
        name = _env_or_arg(args.name, "BOOTSTRAP_SUPER_ADMIN_NAME") or "Platform Admin"
        org_name = _env_or_arg(args.org_name, "BOOTSTRAP_SUPER_ADMIN_ORG_NAME") or "Rafiki"
        org_code = _validate_org_code(_env_or_arg(args.org_code, "BOOTSTRAP_SUPER_ADMIN_ORG_CODE") or "rafiki")
        bootstrap_super_admin(email=email, password=password, name=name, org_name=org_name, org_code=org_code)
    except Exception as exc:
        logger.error("Bootstrap failed: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
