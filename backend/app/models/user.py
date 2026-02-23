from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, ENUM

from app.database import Base


USER_ROLE_ENUM = ENUM(
    "user",
    "hr_admin",
    "clinical_reviewer",
    "super_admin",
    name="user_role_enum",
    create_type=False,
)


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


class User(Base):
    __tablename__ = "users_legacy"

    user_id = Column(UUID(as_uuid=True), primary_key=True)
    org_id = Column(UUID(as_uuid=True), nullable=True)

    anonymous_alias = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True, index=True)
    password_hash = Column(String(255), nullable=False)

    role = Column(USER_ROLE_ENUM, nullable=False)

    language_preference = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
    name = Column(String(200), nullable=True)

    department = Column(String(100), nullable=True)
    job_title = Column(String(200), nullable=True)
    manager_id = Column(UUID(as_uuid=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
