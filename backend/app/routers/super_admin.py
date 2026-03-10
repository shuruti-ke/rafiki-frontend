"""
Super Admin router — org management, HR admin creation, platform stats.
All endpoints require super_admin role.
"""

import os
import random
import string
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session
import logging

from app.database import get_db
from app.dependencies import require_super_admin
from app.models.user import Organization, User
from app.models.document import Document
from app.routers.auth import _hash_password
from app.services.email import send_hr_admin_welcome_email

logger = logging.getLogger(__name__)

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
    employee_count: Optional[int] = None


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    org_code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[int] = None
    is_active: Optional[bool] = None


class OrgStatusUpdate(BaseModel):
    is_active: bool


class UserStatusUpdate(BaseModel):
    is_active: bool


class OrgOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    org_id: UUID
    name: str
    org_code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[int] = None
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


# ---------- Org list ----------

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
                employee_count=org.employee_count,
                is_active=bool(org.is_active) if org.is_active is not None else True,
                created_at=org.created_at,
                updated_at=getattr(org, "updated_at", None),
                user_count=int(user_counts.get(org.org_id, 0)),
                documents_count=int(doc_counts.get(org.org_id, 0)),
                admin_email=admin.email if admin else None,
            )
        )

    return result


# ---------- Org details ----------

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
        is_active=bool(org.is_active) if org.is_active is not None else True,
        created_at=org.created_at,
        updated_at=getattr(org, "updated_at", None),
        user_count=int(user_count),
        documents_count=int(documents_count),
        admin_email=admin.email if admin else None,
    )


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


# ---------- Org create / update / status ----------

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

    if "org_code" in updates and updates["org_code"] and updates["org_code"] != org.org_code:
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


@router.post("/orgs/{org_id}/deactivate", response_model=OrgOut)
def deactivate_org(
    org_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Deactivate an organization (soft disable)."""
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.is_active = False
    db.commit()
    db.refresh(org)
    return org


@router.post("/orgs/{org_id}/activate", response_model=OrgOut)
def activate_org(
    org_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Activate an organization."""
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.is_active = True
    db.commit()
    db.refresh(org)
    return org


# ---------- Delete org (optional) ----------
# NOTE: consider "soft delete" via is_active=False instead of hard delete.

@router.delete("/orgs/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_org(
    org_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Guard: do not delete orgs that still have users/documents
    users_exist = db.query(User.user_id).filter(User.org_id == org_id).first() is not None
    docs_exist = db.query(Document.id).filter(Document.org_id == org_id).first() is not None
    if users_exist or docs_exist:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete org with existing users/documents. Deactivate instead.",
        )

    db.delete(org)
    db.commit()
    return None


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

    email = payload.email.strip().lower()

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=email,
        password_hash=_hash_password(payload.password),
        name=payload.full_name,
        role="hr_admin",
        org_id=org_id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Best-effort: send welcome email to the new HR admin (client)
    try:
        login_url = (os.getenv("HRADMIN_LOGIN_URL", "") or "").strip() or None
        org_name = getattr(org, "name", "") or "your organization"
        send_hr_admin_welcome_email(
            to_email=user.email,
            full_name=payload.full_name,
            org_name=org_name,
            temporary_password=payload.password,
            login_url=login_url,
        )
    except Exception:
        logger.exception(
            "Failed to send HR admin welcome email for org_id=%s email=%s",
            org_id,
            email,
        )

    return user


# ---------- HR admin / user status (deactivate / activate) ----------


@router.patch("/users/{user_id}/status", response_model=UserOut)
def set_user_status(
    user_id: UUID,
    payload: UserStatusUpdate,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Set is_active for a user (e.g. deactivate or reactivate an HR admin)."""
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/deactivate", response_model=UserOut)
def deactivate_user(
    user_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Deactivate a user (e.g. HR admin). They can no longer log in."""
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/activate", response_model=UserOut)
def activate_user(
    user_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Activate a user (e.g. HR admin)."""
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = True
    db.commit()
    db.refresh(user)
    return user
