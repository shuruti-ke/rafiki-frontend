import secrets

from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


# ---------------------------------------------------
# Helpers
# ---------------------------------------------------

def _alias_default() -> str:
    """
    Generate a short non-PII anonymous alias.

    Example: u_a3f91c2d77aa
    """
    return "u_" + secrets.token_hex(6)


# ---------------------------------------------------
# Enums
# ---------------------------------------------------

USER_ROLE_ENUM = String(50)  # was PostgreSQL ENUM; use String to avoid enum migration issues


# ---------------------------------------------------
# Organization
# ---------------------------------------------------

class Organization(Base):
    __tablename__ = "orgs"

    org_id = Column(UUID(as_uuid=True), primary_key=True)
    name = Column(String(200), nullable=False)
    org_code = Column(String(50), nullable=False, unique=True, index=True)

    description = Column(Text, nullable=True)
    industry = Column(String(255), nullable=True)
    employee_count = Column(String(50), nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ---------------------------------------------------
# User (users_legacy)
# ---------------------------------------------------

class User(Base):
    __tablename__ = "users_legacy"

    user_id = Column(UUID(as_uuid=True), primary_key=True)
    org_id = Column(UUID(as_uuid=True), nullable=True)

    # 🔥 CRITICAL FIX: must be NOT NULL to match DB
    anonymous_alias = Column(
        String(255),
        nullable=False,
        default=_alias_default,
        index=True,
    )

    email = Column(String(255), nullable=True, index=True)
    password_hash = Column(String(255), nullable=False)

    role = Column(USER_ROLE_ENUM, nullable=False)

    language_preference = Column(String(50), nullable=False, default="en")
    is_active = Column(Boolean, default=True)
    name = Column(String(200), nullable=True)

    department = Column(String(100), nullable=True)
    job_title = Column(String(200), nullable=True)
    manager_id = Column(UUID(as_uuid=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
