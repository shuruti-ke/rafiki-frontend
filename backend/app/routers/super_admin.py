"""
Super Admin router — org management, HR admin creation, platform stats.
All endpoints require super_admin role.
"""

import string
import random

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.dependencies import require_super_admin
from app.models.user import Organization, User
from app.routers.auth import _hash_password

router = APIRouter(prefix="/super-admin", tags=["super-admin"])


def _generate_code(length: int = 5) -> str:
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=length))


def _unique_code(db: Session, length: int = 5) -> str:
    for _ in range(20):
        code = _generate_code(length)
        if not db.query(Organization).filter(Organization.code == code).first():
            return code
    raise HTTPException(status_code=500, detail="Could not generate unique org code")


# ---------- schemas ----------

class OrgCreate(BaseModel):
    name: str
    code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[int] = None


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[int] = None
    is_active: Optional[bool] = None


class OrgOut(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[int] = None
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OrgListItem(OrgOut):
    user_count: int = 0
    admin_email: Optional[str] = None


class HRAdminCreate(BaseModel):
    email: str
    password: str
    full_name: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: str
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


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
    total_orgs = db.query(func.count(Organization.id)).scalar() or 0
    total_users = db.query(func.count(User.id)).scalar() or 0
    active_orgs = db.query(func.count(Organization.id)).filter(
        Organization.is_active == True
    ).scalar() or 0
    return PlatformStats(
        total_orgs=total_orgs,
        total_users=total_users,
        active_orgs=active_orgs,
    )


# ---------- Org CRUD ----------

@router.get("/orgs", response_model=list[OrgListItem])
def list_orgs(
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    orgs = db.query(Organization).order_by(Organization.created_at.desc()).all()
    result = []
    for org in orgs:
        user_count = db.query(func.count(User.id)).filter(User.org_id == org.id).scalar() or 0
        admin = (
            db.query(User)
            .filter(User.org_id == org.id, User.role == "hr_admin")
            .first()
        )
        result.append(OrgListItem(
            id=org.id,
            name=org.name,
            code=org.code,
            industry=org.industry,
            description=org.description,
            employee_count=org.employee_count,
            is_active=org.is_active if org.is_active is not None else True,
            created_at=org.created_at,
            user_count=user_count,
            admin_email=admin.email if admin else None,
        ))
    return result


@router.post("/orgs", response_model=OrgOut, status_code=201)
def create_org(
    payload: OrgCreate,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    code = payload.code or _unique_code(db)
    if db.query(Organization).filter(Organization.code == code).first():
        raise HTTPException(status_code=409, detail="Organization code already in use")

    org = Organization(
        name=payload.name,
        code=code,
        industry=payload.industry,
        description=payload.description,
        employee_count=payload.employee_count,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@router.get("/orgs/{org_id}", response_model=OrgOut)
def get_org(
    org_id: int,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.put("/orgs/{org_id}", response_model=OrgOut)
def update_org(
    org_id: int,
    payload: OrgUpdate,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    updates = payload.model_dump(exclude_unset=True)

    if "code" in updates and updates["code"] != org.code:
        existing = db.query(Organization).filter(
            Organization.code == updates["code"],
            Organization.id != org_id,
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Organization code already in use")

    for key, value in updates.items():
        setattr(org, key, value)

    db.commit()
    db.refresh(org)
    return org


# ---------- Org users ----------

@router.get("/orgs/{org_id}/users", response_model=list[UserOut])
def list_org_users(
    org_id: int,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
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
    org_id: int,
    payload: HRAdminCreate,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email,
        password_hash=_hash_password(payload.password),
        full_name=payload.full_name,
        role="hr_admin",
        org_id=org_id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
