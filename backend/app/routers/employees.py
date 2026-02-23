# backend/app/routers/employees.py

import uuid
import secrets
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.dependencies import get_current_org_id, require_admin
from app.models.user import User  # users_legacy (UUID)
from app.models.employee_profile import EmployeeProfile
from app.services.auth import get_password_hash

router = APIRouter(prefix="/api/v1/employees", tags=["Employee Management"])


# ---------- helpers ----------

def _make_alias() -> str:
    """
    users_legacy.anonymous_alias is NOT NULL in DB.
    Generate a short non-PII alias.
    """
    return "u_" + secrets.token_hex(6)


def _parse_date(d: Optional[str]) -> Optional[date]:
    if not d:
        return None
    try:
        return date.fromisoformat(d)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid date: {d}. Expected YYYY-MM-DD")


def _parse_dt(d: Optional[str]) -> Optional[datetime]:
    if not d:
        return None
    try:
        return datetime.fromisoformat(d)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {d}. Expected ISO format")


def _user_dict(u: User) -> dict:
    return {
        "user_id": str(u.user_id),
        "org_id": str(u.org_id) if u.org_id else None,
        "email": u.email,
        "name": getattr(u, "name", None),
        "role": str(u.role) if u.role else "user",
        "language_preference": getattr(u, "language_preference", None),  # ✅ include
        "department": getattr(u, "department", None),
        "job_title": getattr(u, "job_title", None),
        "manager_id": str(u.manager_id) if getattr(u, "manager_id", None) else None,
        "is_active": bool(getattr(u, "is_active", True)),
        "created_at": u.created_at.isoformat() if getattr(u, "created_at", None) else None,
        "updated_at": u.updated_at.isoformat() if getattr(u, "updated_at", None) else None,
    }


def _profile_dict(p: Optional[EmployeeProfile]) -> Optional[dict]:
    if not p:
        return None
    return {
        "id": str(p.id),
        "user_id": str(p.user_id),
        "org_id": str(p.org_id),

        "employment_number": p.employment_number,
        "national_id": p.national_id,

        "job_title": p.job_title,
        "department": p.department,
        "job_description": p.job_description,

        "contract_type": p.contract_type,
        "contract_start": p.contract_start,
        "contract_end": p.contract_end,

        "targets": p.targets,

        "phone": p.phone,
        "avatar_url": p.avatar_url,
        "emergency_contact": p.emergency_contact,

        "status": p.status,
        "start_date": p.start_date.isoformat() if p.start_date else None,
        "end_date": p.end_date.isoformat() if p.end_date else None,
        "duration_months": p.duration_months,
        "evaluation_period_months": p.evaluation_period_months,
        "probation_end_date": p.probation_end_date.isoformat() if p.probation_end_date else None,

        "terms_of_service_title": p.terms_of_service_title,
        "terms_of_service_text": p.terms_of_service_text,
        "terms_of_service_signed_at": p.terms_of_service_signed_at.isoformat()
        if p.terms_of_service_signed_at
        else None,

        "address_line1": p.address_line1,
        "address_line2": p.address_line2,
        "city": p.city,
        "state": p.state,
        "postal_code": p.postal_code,
        "country": p.country,

        "emergency_contact_name": p.emergency_contact_name,
        "emergency_contact_phone": p.emergency_contact_phone,
        "emergency_contact_relationship": p.emergency_contact_relationship,

        "notes": p.notes,

        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _combined(u: User, p: Optional[EmployeeProfile]) -> dict:
    return {"user": _user_dict(u), "profile": _profile_dict(p)}


def _get_profile(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> Optional[EmployeeProfile]:
    return (
        db.query(EmployeeProfile)
        .filter(EmployeeProfile.org_id == org_id, EmployeeProfile.user_id == user_id)
        .first()
    )


# ---------- schemas ----------

class EmployeeCreateRequest(BaseModel):
    email: EmailStr
    name: Optional[str] = None

    # users_legacy fields
    role: Optional[str] = "user"
    language_preference: Optional[str] = "en"  # ✅ NEW
    department: Optional[str] = None
    job_title: Optional[str] = None
    manager_id: Optional[str] = None

    # employee_profiles (existing + new)
    employment_number: Optional[str] = None
    national_id: Optional[str] = None
    job_description: Optional[str] = None
    contract_type: Optional[str] = None
    contract_start: Optional[str] = None
    contract_end: Optional[str] = None
    targets: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    emergency_contact: Optional[str] = None

    status: Optional[str] = "active"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    duration_months: Optional[int] = None
    evaluation_period_months: Optional[int] = None
    probation_end_date: Optional[str] = None

    terms_of_service_title: Optional[str] = None
    terms_of_service_text: Optional[str] = None
    terms_of_service_signed_at: Optional[str] = None

    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None

    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None

    notes: Optional[str] = None

    temporary_password: Optional[str] = None


class EmployeeUpdateRequest(BaseModel):
    # users_legacy fields
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    role: Optional[str] = None
    language_preference: Optional[str] = None  # ✅ NEW
    department: Optional[str] = None
    job_title: Optional[str] = None
    manager_id: Optional[str] = None
    is_active: Optional[bool] = None

    # employee_profiles fields
    employment_number: Optional[str] = None
    national_id: Optional[str] = None
    job_description: Optional[str] = None
    contract_type: Optional[str] = None
    contract_start: Optional[str] = None
    contract_end: Optional[str] = None
    targets: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    emergency_contact: Optional[str] = None

    status: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    duration_months: Optional[int] = None
    evaluation_period_months: Optional[int] = None
    probation_end_date: Optional[str] = None

    terms_of_service_title: Optional[str] = None
    terms_of_service_text: Optional[str] = None
    terms_of_service_signed_at: Optional[str] = None

    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None

    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None

    notes: Optional[str] = None


# ---------- endpoints ----------

@router.get("/")
def list_employees(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    search: Optional[str] = Query(default=None),
    department: Optional[str] = Query(default=None),
    job_title: Optional[str] = Query(default=None),
):
    q = db.query(User).filter(User.org_id == org_id)

    if department:
        q = q.filter(User.department == department)
    if job_title:
        q = q.filter(User.job_title == job_title)

    if search:
        like = f"%{search.strip()}%"
        q = q.filter(or_(User.email.ilike(like), User.name.ilike(like)))

    users = q.order_by(User.created_at.desc()).all()
    user_ids = [u.user_id for u in users]

    profiles = (
        db.query(EmployeeProfile)
        .filter(EmployeeProfile.org_id == org_id, EmployeeProfile.user_id.in_(user_ids))
        .all()
    )
    pmap = {p.user_id: p for p in profiles}

    return [_combined(u, pmap.get(u.user_id)) for u in users]


@router.post("/")
def create_employee(
    body: EmployeeCreateRequest,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    email = (body.email or "").strip().lower()

    existing = db.query(User).filter(User.org_id == org_id, User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="A user with this email already exists in this organization")

    temp_pw = body.temporary_password or secrets.token_urlsafe(10)

    u = User(
        user_id=uuid.uuid4(),
        org_id=org_id,
        anonymous_alias=_make_alias(),  # ✅ DB NOT NULL
        email=email,
        password_hash=get_password_hash(temp_pw),
        role=body.role or "user",
        language_preference=(body.language_preference or "en"),  # ✅ DB NOT NULL
        is_active=True,
        name=body.name,
        department=body.department,
        job_title=body.job_title,
        manager_id=uuid.UUID(body.manager_id) if body.manager_id else None,
    )
    db.add(u)
    db.flush()

    p = EmployeeProfile(
        id=uuid.uuid4(),
        user_id=u.user_id,
        org_id=org_id,

        employment_number=body.employment_number,
        national_id=body.national_id,
        job_title=body.job_title,
        department=body.department,
        job_description=body.job_description,

        contract_type=body.contract_type,
        contract_start=body.contract_start,
        contract_end=body.contract_end,

        targets=body.targets,
        phone=body.phone,
        avatar_url=body.avatar_url,
        emergency_contact=body.emergency_contact,

        status=body.status or "active",
        start_date=_parse_date(body.start_date),
        end_date=_parse_date(body.end_date),
        duration_months=body.duration_months,
        evaluation_period_months=body.evaluation_period_months,
        probation_end_date=_parse_date(body.probation_end_date),

        terms_of_service_title=body.terms_of_service_title,
        terms_of_service_text=body.terms_of_service_text,
        terms_of_service_signed_at=_parse_dt(body.terms_of_service_signed_at),

        address_line1=body.address_line1,
        address_line2=body.address_line2,
        city=body.city,
        state=body.state,
        postal_code=body.postal_code,
        country=body.country,

        emergency_contact_name=body.emergency_contact_name,
        emergency_contact_phone=body.emergency_contact_phone,
        emergency_contact_relationship=body.emergency_contact_relationship,

        notes=body.notes,
    )
    db.add(p)

    db.commit()
    db.refresh(u)
    db.refresh(p)

    return {
        "employee": _combined(u, p),
        "temporary_password": temp_pw,
        "message": "Employee created. Share the temporary password securely and prompt them to change it.",
    }


@router.get("/{user_id}")
def get_employee(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    u = db.query(User).filter(User.user_id == user_id, User.org_id == org_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")

    p = _get_profile(db, org_id, user_id)
    return _combined(u, p)


@router.put("/{user_id}")
def update_employee(
    user_id: uuid.UUID,
    body: EmployeeUpdateRequest,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    u = db.query(User).filter(User.user_id == user_id, User.org_id == org_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")

    # users_legacy updates
    if body.email is not None:
        u.email = body.email.strip().lower()
    if body.name is not None:
        u.name = body.name
    if body.role is not None:
        u.role = body.role
    if body.language_preference is not None:
        u.language_preference = body.language_preference or "en"  # ✅ DB NOT NULL
    if body.department is not None:
        u.department = body.department
    if body.job_title is not None:
        u.job_title = body.job_title
    if body.manager_id is not None:
        u.manager_id = uuid.UUID(body.manager_id) if body.manager_id else None
    if body.is_active is not None:
        u.is_active = body.is_active

    # upsert profile
    p = _get_profile(db, org_id, user_id)
    if not p:
        p = EmployeeProfile(id=uuid.uuid4(), user_id=user_id, org_id=org_id)
        db.add(p)

    # keep core org placement synced
    if body.department is not None:
        p.department = body.department
    if body.job_title is not None:
        p.job_title = body.job_title

    # profile updates
    for field in [
        "employment_number", "national_id", "job_description",
        "contract_type", "contract_start", "contract_end",
        "targets", "phone", "avatar_url", "emergency_contact",
        "status", "duration_months", "evaluation_period_months",
        "terms_of_service_title", "terms_of_service_text",
        "address_line1", "address_line2", "city", "state", "postal_code", "country",
        "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship",
        "notes",
    ]:
        val = getattr(body, field, None)
        if val is not None:
            setattr(p, field, val)

    if body.start_date is not None:
        p.start_date = _parse_date(body.start_date)
    if body.end_date is not None:
        p.end_date = _parse_date(body.end_date)
    if body.probation_end_date is not None:
        p.probation_end_date = _parse_date(body.probation_end_date)
    if body.terms_of_service_signed_at is not None:
        p.terms_of_service_signed_at = _parse_dt(body.terms_of_service_signed_at)

    db.commit()
    db.refresh(u)
    db.refresh(p)
    return _combined(u, p)


@router.post("/{user_id}/deactivate")
def deactivate_employee(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    u = db.query(User).filter(User.user_id == user_id, User.org_id == org_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")
    u.is_active = False
    db.commit()
    return {"ok": True, "user_id": str(user_id), "is_active": False}


@router.post("/{user_id}/activate")
def activate_employee(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    u = db.query(User).filter(User.user_id == user_id, User.org_id == org_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")
    u.is_active = True
    db.commit()
    return {"ok": True, "user_id": str(user_id), "is_active": True}
