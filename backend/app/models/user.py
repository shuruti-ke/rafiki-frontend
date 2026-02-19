from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class Organization(Base):
    __tablename__ = "orgs"

    org_id = Column(UUID(as_uuid=True), primary_key=True)
    name = Column(String(200), nullable=False)
    org_code = Column(String(50), nullable=False, unique=True, index=True)

    description = Column(Text, nullable=True)
    industry = Column(String(255), nullable=True)

    # Keep Integer only if your orgs.employee_count is actually integer in Postgres
    # If unsure, leave as String until confirmed.
    employee_count = Column(String(50), nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class User(Base):
    __tablename__ = "users_legacy"

    user_id = Column(UUID(as_uuid=True), primary_key=True)
    org_id = Column(UUID(as_uuid=True), nullable=True)

    anonymous_alias = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True, index=True)
    password_hash = Column(String(255), nullable=False)

    # Postgres enum maps cleanly to String for reads/writes unless you explicitly declare Enum
    role = Column(String(50), nullable=False)

    language_preference = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)

    name = Column(String(200), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
