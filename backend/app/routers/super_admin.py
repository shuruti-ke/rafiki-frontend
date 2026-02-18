"""
Super Admin router — org management, HR admin creation, platform stats.
All endpoints require super_admin role.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.dependencies import require_super_admin
from app.models.user import Organization, User
from app.routers.auth import _hash_password

router = APIRouter(prefix="/api/v1/super-admin", tags=["super-admin"])


# ---------- schemas ----------

class CreateOrgRequest(BaseModel):
    name: str
    code: str

class OrgResponse(BaseModel):
    id: int
    name: str
    code: str

class CreateHRAdminRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    org_id: int

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    org_id: int | None

class StatsResponse(BaseModel):
    total_orgs: int
    total_users: int
    total_hr_admins: int


# ---------- endpoints ----------

@router.get("/organizations", response_model=list[OrgResponse])
def list_organizations(
    db: Session = Depends(get_db),
    _role: str = Depends(require_super_admin),
):
    orgs = db.query(Organization).order_by(Organization.id).all()
    return [OrgResponse(id=o.id, name=o.name, code=o.code) for o in orgs]


@router.post("/organizations", response_model=OrgResponse)
def create_organization(
    body: CreateOrgRequest,
    db: Session = Depends(get_db),
    _role: str = Depends(require_super_admin),
):
    code = body.code.strip().lower()
    existing = db.query(Organization).filter(Organization.code == code).first()
    if existing:
        raise HTTPException(status_code=409, detail="Organization code already exists")
    org = Organization(name=body.name.strip(), code=code)
    db.add(org)
    db.commit()
    db.refresh(org)
    return OrgResponse(id=org.id, name=org.name, code=org.code)


@router.get("/organizations/{org_id}", response_model=OrgResponse)
def get_organization(
    org_id: int,
    db: Session = Depends(get_db),
    _role: str = Depends(require_super_admin),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrgResponse(id=org.id, name=org.name, code=org.code)


@router.post("/hr-admins", response_model=UserResponse)
def create_hr_admin(
    body: CreateHRAdminRequest,
    db: Session = Depends(get_db),
    _role: str = Depends(require_super_admin),
):
    # Verify org exists
    org = db.query(Organization).filter(Organization.id == body.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check email uniqueness
    existing = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email.strip().lower(),
        password_hash=_hash_password(body.password),
        full_name=body.full_name.strip(),
        role="hr_admin",
        org_id=body.org_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse(id=user.id, email=user.email, full_name=user.full_name, role=user.role, org_id=user.org_id)


@router.get("/hr-admins", response_model=list[UserResponse])
def list_hr_admins(
    db: Session = Depends(get_db),
    _role: str = Depends(require_super_admin),
):
    admins = db.query(User).filter(User.role == "hr_admin").order_by(User.id).all()
    return [UserResponse(id=u.id, email=u.email, full_name=u.full_name, role=u.role, org_id=u.org_id) for u in admins]


@router.get("/stats", response_model=StatsResponse)
def get_stats(
    db: Session = Depends(get_db),
    _role: str = Depends(require_super_admin),
):
    total_orgs = db.query(func.count(Organization.id)).scalar() or 0
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_hr_admins = db.query(func.count(User.id)).filter(User.role == "hr_admin").scalar() or 0
    return StatsResponse(total_orgs=total_orgs, total_users=total_users, total_hr_admins=total_hr_admins)
