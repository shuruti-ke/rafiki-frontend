from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.database import Base


class OrgProfile(Base):
    __tablename__ = "org_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    org_id = Column(Integer, nullable=False, unique=True, index=True)
    org_purpose = Column(String(300), nullable=True)
    industry = Column(String(100), nullable=True)
    work_environment = Column(String(50), nullable=True)  # remote, hybrid, on-site, field-based
    benefits_tags = Column(JSONB, nullable=True, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RoleProfile(Base):
    __tablename__ = "role_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    org_id = Column(Integer, nullable=False, index=True)
    role_key = Column(String(100), nullable=False)
    role_family = Column(String(100), nullable=True)
    seniority_band = Column(String(50), nullable=True)  # individual_contributor, team_lead, manager
    work_pattern = Column(String(50), nullable=True)  # standard, night_shift, rotating, travel_intensive
    stressor_profile = Column(JSONB, nullable=True, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("org_id", "role_key", name="uq_org_role_key"),
    )
