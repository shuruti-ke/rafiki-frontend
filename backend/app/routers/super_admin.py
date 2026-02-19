"""
Super Admin router — org management, HR admin creation, platform stats.
All endpoints require super_admin role.
"""

import random
import string
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_super_admin

# ✅ Keep imports aligned to your current project structure:
# Organization is in app.models.user (table: orgs, PK: org_id UUID, code: org_code)
# User is in app.models.user (table: users_legacy, PK: user_id UUID, role enum)
from app.models.user import Organization, User

# Documents are UUID-based too (table: documents, PK: id UUID, org_id UUID)
from app.models.document import Document

# Password helper (legacy format) used when creating HR admins
from app.routers.auth import _hash_password

router = APIRouter(prefix="/super-admin", tags=["super-admin"])


# ---------- helpers ----------

def _generate_code(length: int = 5) -> str:
    chars = string.digits
    return "".join(random.choices(chars, k=length))


def _unique_code(db: Session, length: int = 5) -> str:
    for _ in range(50):
        code = _generate_code(length)
        exists = db.query(Organization).filter(Organization.org_code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=500, detail="Could not generate unique org code")


# ---------- schemas ----------

class OrgCreate(BaseModel):
    name: str
    org_code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[int] = None  # ✅ FIXED


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    org_code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[int] = None  # ✅ FIXED
    is_active: Optional[bool] = None


class OrgStatusUpdate(BaseModel):
    is_active: bool


class OrgOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    org_id: UUID
    name: str
    org_code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[int] = None  # ✅ FIXED
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class OrgListItem(OrgOut):
    user_count: int = 0
    documents_count: int = 0
    admin_email: Optional[str] = None


class HRAdminCreate(BaseModel):
    email: str
    password: str
    full_name: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: Optional[str] = None
    name: Optional[str] = None
    role: str
    org_id: Optional[UUID] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PlatformStats(BaseModel):
    total_orgs: int
    total_users: int
    active_orgs: int
    total_documents: int


# ---------- Platform stats ----------

@router.get("/stats", response_model=PlatformStats)
def get_platform_stats(
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    total_orgs = db.query(func.count(Organization.org_id)).scalar() or 0
    total_users = db.query(func.count(User.user_id)).scalar() or 0
    active_orgs = (
        db.query(func.count(Organization.org_id))
        .filter(Organization.is_active == True)
        .scalar()
        or 0
    )
    total_documents = db.query(func.count(Document.id)).scalar() or 0

    return PlatformStats(
        total_orgs=int(total_orgs),
        total_users=int(total_users),
        active_orgs=int(active_orgs),
        total_documents=int(total_documents),
    )


# ---------- Org CRUD + analytics ----------

@router.get("/orgs", response_model=list[OrgListItem])
def list_orgs(
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    orgs = db.query(Organization).order_by(Organization.created_at.desc()).all()

    user_counts = dict(
        db.query(User.org_id, func.count(User.user_id))
        .group_by(User.org_id)
        .all()
    )
    doc_counts = dict(
        db.query(Document.org_id, func.count(Document.id))
        .group_by(Document.org_id)
        .all()
    )

    result: list[OrgListItem] = []
    for org in orgs:
        admin = (
            db.query(User)
            .filter(User.org_id == org.org_id, User.role == "hr_admin")
            .first()
        )

        result.append(
            OrgListItem(
                org_id=org.org_id,
                name=org.name,
                org_code=org.org_code,
                industry=org.industry,
                description=org.description,
                employee_count=org.employee_count,  # ✅ now matches schema
                is_active=bool(org.is_active) if org.is_active is not None else True,
                created_at=org.created_at,
                updated_at=getattr(org, "updated_at", None),
                user_count=int(user_counts.get(org.org_id, 0)),
                documents_count=int(doc_counts.get(org.org_id, 0)),
                admin_email=admin.email if admin else None,
            )
        )

    return result
