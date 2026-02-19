from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.sql import func

from app.database import Base


class Organization(Base):
    # DB table name is "orgs"
    __tablename__ = "orgs"

    # DB primary key is "org_id"
    org_id = Column(Integer, primary_key=True, autoincrement=True)

    name = Column(String(200), nullable=False)

    # DB code column is "org_code"
    org_code = Column(String(50), nullable=False, unique=True, index=True)

    description = Column(Text, nullable=True)
    industry = Column(String(255), nullable=True)
    employee_count = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(200), nullable=False)
    role = Column(String(50), nullable=False, default="employee")  # super_admin, hr_admin, manager, employee

    # FK must point to orgs.org_id
    org_id = Column(Integer, ForeignKey("orgs.org_id"), nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

