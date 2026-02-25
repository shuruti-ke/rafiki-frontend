from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


# ─── Org Profile ─────────────────────────────────────────────────────

class OrgProfileCreate(BaseModel):
    org_purpose: str | None = None
    industry: str | None = None
    work_environment: str | None = None  # remote, hybrid, on-site, field-based
    benefits_tags: list[str] = []


class OrgProfileUpdate(BaseModel):
    org_purpose: Optional[str] = None
    industry: Optional[str] = None
    work_environment: Optional[str] = None
    benefits_tags: Optional[list[str]] = None


class OrgProfileResponse(BaseModel):
    org_id: UUID
    org_purpose: str | None = None
    industry: str | None = None
    work_environment: str | None = None
    benefits_tags: list[str] | None = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── Role Profile ────────────────────────────────────────────────────

class RoleProfileCreate(BaseModel):
    role_key: str
    role_family: str | None = None
    seniority_band: str | None = None  # individual_contributor, team_lead, manager
    work_pattern: str | None = None  # standard, night_shift, rotating, travel_intensive
    stressor_profile: list[str] = []


class RoleProfileUpdate(BaseModel):
    role_family: Optional[str] = None
    seniority_band: Optional[str] = None
    work_pattern: Optional[str] = None
    stressor_profile: Optional[list[str]] = None


class RoleProfileResponse(BaseModel):
    id: int
    org_id: UUID
    role_key: str
    role_family: str | None = None
    seniority_band: str | None = None
    work_pattern: str | None = None
    stressor_profile: list[str] | None = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
