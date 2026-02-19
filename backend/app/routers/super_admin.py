"""
Super Admin router — org management, HR admin creation, platform stats.
All endpoints require super_admin role.
"""

import string
import random
from uuid import UUID
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.dependencies import require_super_admin

# ✅ IMPORTANT:
# - Organization must map to table "orgs" with columns org_id, org_code, is_active, etc.
# - User must map to table "users_legacy" with columns user_id, org_id, role, etc.
from app.models.org import Organization
from app.models.user import User

from app.models.document import Document

# ⚠️ Avoid importing _hash_password from routers/auth if you can.
# If you already have a hashing helper in services/auth.py, use it instead.
# Keeping your existing import for now:
from app.routers.auth import _hash_password

router = APIRouter(prefix="/super-admin", tags=["super-admin"])


def _generate_code(length: int = 5) -> str:
    # Your org_code examples are numeric strings ("54321"), but you can keep alnum if you want.
    chars = string.digits
    return "".join(random.choices(chars, k=length))


def _unique_code(db: Session, length: int = 5) -> str:
    for _ in range(20):
        code = _generate_code(length)
        if not db.query(Organization).filter(Organization.org_code == code).first():
            return code
    raise HTTPException(status_code=500, detail="Could not generate unique org code")


# ---------- schemas ----------

class OrgCreate(BaseModel):
    name: str
    org_code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[str] = None


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    org_code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[str] = None
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
    employee_count: Optional[str] = None
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
    is_active: bool = True
    created_at: Optional[datetime] = None


class PlatformStats(BaseModel):
    total_orgs: int
    total_users: int
    active_orgs: int


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
    return PlatformStats(
        total_orgs=int(total_orgs),
        total_users=int(total_users),
        active_orgs=int(active_orgs),
    )


# ---------- Org CRUD + analytics ----------

@router.get("/orgs", response_model=list[OrgListItem])
def list_orgs(
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    orgs = db.query(Organization).order_by(Organization.created_at.desc()).all()

    # Precompute counts in 2 queries (faster than N+1 counting)
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

    result = []
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
                employee_count=org.employee_count,
                is_active=org.is_active if org.is_active is not None else True,
                created_at=org.created_at,
                updated_at=getattr(org, "updated_at", None),
                user_count=int(user_counts.get(org.org_id, 0)),
                documents_count=int(doc_counts.get(org.org_id, 0)),
                admin_email=admin.email if admin else None,
            )
        )
    return result


@router.post("/orgs", response_model=OrgOut, status_code=201)
def create_org(
    payload: OrgCreate,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    code = (payload.org_code or _unique_code(db)).strip()

    if db.query(Organization).filter(Organization.org_code == code).first():
        raise HTTPException(status_code=409, detail="Organization code already in use")

    org = Organization(
        name=payload.name,
        org_code=code,
        industry=payload.industry,
        description=payload.description,
        employee_count=payload.employee_count,
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@router.get("/orgs/{org_id}", response_model=OrgListItem)
def get_org(
    org_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    user_count = (
        db.query(func.count(User.user_id))
        .filter(User.org_id == org_id)
        .scalar()
        or 0
    )
    documents_count = (
        db.query(func.count(Document.id))
        .filter(Document.org_id == org_id)
        .scalar()
        or 0
    )
    admin = (
        db.query(User)
        .filter(User.org_id == org_id, User.role == "hr_admin")
        .first()
    )

    return OrgListItem(
        org_id=org.org_id,
        name=org.name,
        org_code=org.org_code,
        industry=org.industry,
        description=org.description,
        employee_count=org.employee_count,
        is_active=org.is_active if org.is_active is not None else True,
        created_at=org.created_at,
        updated_at=getattr(org, "updated_at", None),
        user_count=int(user_count),
        documents_count=int(documents_count),
        admin_email=admin.email if admin else None,
    )


@router.put("/orgs/{org_id}", response_model=OrgOut)
def update_org(
    org_id: UUID,
    payload: OrgUpdate,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    updates = payload.model_dump(exclude_unset=True)

    if "org_code" in updates and updates["org_code"] != org.org_code:
        existing = (
            db.query(Organization)
            .filter(Organization.org_code == updates["org_code"], Organization.org_id != org_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Organization code already in use")

    for key, value in updates.items():
        setattr(org, key, value)

    db.commit()
    db.refresh(org)
    return org


# ✅ Clean toggle endpoint the UI can call
@router.patch("/orgs/{org_id}/status", response_model=OrgOut)
def set_org_status(
    org_id: UUID,
    payload: OrgStatusUpdate,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org.is_active = payload.is_active
    db.commit()
    db.refresh(org)
    return org


# ---------- Org users ----------

@router.get("/orgs/{org_id}/users", response_model=list[UserOut])
def list_org_users(
    org_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    users = (
        db.query(User)
        .filter(User.org_id == org_id)
        .order_by(User.created_at.desc())
        .all()
    )
    return users


# ---------- Create HR admin ----------

@router.post("/orgs/{org_id}/admin", response_model=UserOut, status_code=201)
def create_hr_admin(
    org_id: UUID,
    payload: HRAdminCreate,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    existing = db.query(User).filter(User.email == payload.email.strip().lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email.strip().lower(),
        password_hash=_hash_password(payload.password),
        name=payload.full_name,
        role="hr_admin",
        org_id=org_id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
