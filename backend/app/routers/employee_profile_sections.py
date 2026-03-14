# backend/app/routers/employee_profile_sections.py
# API for employee profile sections: dependents, work experience, education, company assets

import uuid
from datetime import date, datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_org_id, require_admin
from app.models.user import User
from app.models.employee_extended import (
    EmployeeDependent,
    EmployeeWorkExperience,
    EmployeeEducation,
    EmployeeAsset,
)

router = APIRouter(prefix="/api/v1/employees", tags=["Employee Profile Sections"])


def _ensure_employee_in_org(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    u = db.query(User).filter(User.user_id == user_id, User.org_id == org_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")


def _parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except ValueError:
            continue
    raise HTTPException(status_code=400, detail=f"Invalid date: {s}")


# ---------- Dependents ----------

class DependentCreate(BaseModel):
    contact_type: str  # next_of_kin, emergency_contact, dependent
    full_name: str
    relationship: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    date_of_birth: Optional[str] = None
    notes: Optional[str] = None


class DependentUpdate(BaseModel):
    contact_type: Optional[str] = None
    full_name: Optional[str] = None
    relationship: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    date_of_birth: Optional[str] = None
    notes: Optional[str] = None


def _dependent_to_dict(d: EmployeeDependent) -> dict:
    return {
        "id": str(d.id),
        "user_id": str(d.user_id),
        "org_id": str(d.org_id),
        "contact_type": d.contact_type,
        "full_name": d.full_name,
        "relationship": d.relationship,
        "phone": d.phone,
        "email": d.email,
        "date_of_birth": d.date_of_birth.isoformat() if d.date_of_birth else None,
        "notes": d.notes,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


@router.get("/{user_id}/dependents", response_model=List[dict])
def list_dependents(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    rows = db.query(EmployeeDependent).filter(
        EmployeeDependent.user_id == user_id,
        EmployeeDependent.org_id == org_id,
    ).order_by(EmployeeDependent.created_at.desc()).all()
    return [_dependent_to_dict(r) for r in rows]


@router.post("/{user_id}/dependents", status_code=201)
def create_dependent(
    user_id: uuid.UUID,
    body: DependentCreate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    if body.contact_type not in ("next_of_kin", "emergency_contact", "dependent"):
        raise HTTPException(status_code=400, detail="contact_type must be next_of_kin, emergency_contact, or dependent")
    d = EmployeeDependent(
        id=uuid.uuid4(),
        user_id=user_id,
        org_id=org_id,
        contact_type=body.contact_type,
        full_name=body.full_name.strip(),
        relationship=body.relationship.strip() if body.relationship else None,
        phone=body.phone.strip() if body.phone else None,
        email=body.email.strip() if body.email else None,
        date_of_birth=_parse_date(body.date_of_birth),
        notes=body.notes.strip() if body.notes else None,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return _dependent_to_dict(d)


@router.put("/{user_id}/dependents/{dependent_id}")
def update_dependent(
    user_id: uuid.UUID,
    dependent_id: uuid.UUID,
    body: DependentUpdate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    d = db.query(EmployeeDependent).filter(
        EmployeeDependent.id == dependent_id,
        EmployeeDependent.user_id == user_id,
        EmployeeDependent.org_id == org_id,
    ).first()
    if not d:
        raise HTTPException(status_code=404, detail="Dependent not found")
    if body.contact_type is not None:
        if body.contact_type not in ("next_of_kin", "emergency_contact", "dependent"):
            raise HTTPException(status_code=400, detail="contact_type must be next_of_kin, emergency_contact, or dependent")
        d.contact_type = body.contact_type
    if body.full_name is not None:
        d.full_name = body.full_name.strip()
    if body.relationship is not None:
        d.relationship = body.relationship.strip() or None
    if body.phone is not None:
        d.phone = body.phone.strip() or None
    if body.email is not None:
        d.email = body.email.strip() or None
    if body.date_of_birth is not None:
        d.date_of_birth = _parse_date(body.date_of_birth)
    if body.notes is not None:
        d.notes = body.notes.strip() or None
    db.commit()
    db.refresh(d)
    return _dependent_to_dict(d)


@router.delete("/{user_id}/dependents/{dependent_id}")
def delete_dependent(
    user_id: uuid.UUID,
    dependent_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    d = db.query(EmployeeDependent).filter(
        EmployeeDependent.id == dependent_id,
        EmployeeDependent.user_id == user_id,
        EmployeeDependent.org_id == org_id,
    ).first()
    if not d:
        raise HTTPException(status_code=404, detail="Dependent not found")
    db.delete(d)
    db.commit()
    return {"ok": True}


# ---------- Work Experience ----------

class WorkExperienceCreate(BaseModel):
    employer_name: str
    job_title: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_current: Optional[str] = None
    responsibilities: Optional[str] = None


class WorkExperienceUpdate(BaseModel):
    employer_name: Optional[str] = None
    job_title: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_current: Optional[str] = None
    responsibilities: Optional[str] = None


def _work_to_dict(w: EmployeeWorkExperience) -> dict:
    return {
        "id": str(w.id),
        "user_id": str(w.user_id),
        "org_id": str(w.org_id),
        "employer_name": w.employer_name,
        "job_title": w.job_title,
        "start_date": w.start_date.isoformat() if w.start_date else None,
        "end_date": w.end_date.isoformat() if w.end_date else None,
        "is_current": w.is_current,
        "responsibilities": w.responsibilities,
        "created_at": w.created_at.isoformat() if w.created_at else None,
        "updated_at": w.updated_at.isoformat() if w.updated_at else None,
    }


@router.get("/{user_id}/work-experience", response_model=List[dict])
def list_work_experience(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    rows = db.query(EmployeeWorkExperience).filter(
        EmployeeWorkExperience.user_id == user_id,
        EmployeeWorkExperience.org_id == org_id,
    ).order_by(EmployeeWorkExperience.start_date.desc().nullslast()).all()
    return [_work_to_dict(r) for r in rows]


@router.post("/{user_id}/work-experience", status_code=201)
def create_work_experience(
    user_id: uuid.UUID,
    body: WorkExperienceCreate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    w = EmployeeWorkExperience(
        id=uuid.uuid4(),
        user_id=user_id,
        org_id=org_id,
        employer_name=body.employer_name.strip(),
        job_title=body.job_title.strip() if body.job_title else None,
        start_date=_parse_date(body.start_date),
        end_date=_parse_date(body.end_date),
        is_current=body.is_current,
        responsibilities=body.responsibilities.strip() if body.responsibilities else None,
    )
    db.add(w)
    db.commit()
    db.refresh(w)
    return _work_to_dict(w)


@router.put("/{user_id}/work-experience/{exp_id}")
def update_work_experience(
    user_id: uuid.UUID,
    exp_id: uuid.UUID,
    body: WorkExperienceUpdate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    w = db.query(EmployeeWorkExperience).filter(
        EmployeeWorkExperience.id == exp_id,
        EmployeeWorkExperience.user_id == user_id,
        EmployeeWorkExperience.org_id == org_id,
    ).first()
    if not w:
        raise HTTPException(status_code=404, detail="Work experience record not found")
    for field in ("employer_name", "job_title", "is_current", "responsibilities"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(w, field, val.strip() if isinstance(val, str) else val)
    if body.start_date is not None:
        w.start_date = _parse_date(body.start_date)
    if body.end_date is not None:
        w.end_date = _parse_date(body.end_date)
    db.commit()
    db.refresh(w)
    return _work_to_dict(w)


@router.delete("/{user_id}/work-experience/{exp_id}")
def delete_work_experience(
    user_id: uuid.UUID,
    exp_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    w = db.query(EmployeeWorkExperience).filter(
        EmployeeWorkExperience.id == exp_id,
        EmployeeWorkExperience.user_id == user_id,
        EmployeeWorkExperience.org_id == org_id,
    ).first()
    if not w:
        raise HTTPException(status_code=404, detail="Work experience record not found")
    db.delete(w)
    db.commit()
    return {"ok": True}


# ---------- Education ----------

class EducationCreate(BaseModel):
    institution: str
    qualification: Optional[str] = None
    field_of_study: Optional[str] = None
    year_completed: Optional[int] = None
    is_certification: Optional[str] = None


class EducationUpdate(BaseModel):
    institution: Optional[str] = None
    qualification: Optional[str] = None
    field_of_study: Optional[str] = None
    year_completed: Optional[int] = None
    is_certification: Optional[str] = None


def _education_to_dict(e: EmployeeEducation) -> dict:
    return {
        "id": str(e.id),
        "user_id": str(e.user_id),
        "org_id": str(e.org_id),
        "institution": e.institution,
        "qualification": e.qualification,
        "field_of_study": e.field_of_study,
        "year_completed": e.year_completed,
        "is_certification": e.is_certification,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
    }


@router.get("/{user_id}/education", response_model=List[dict])
def list_education(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    rows = db.query(EmployeeEducation).filter(
        EmployeeEducation.user_id == user_id,
        EmployeeEducation.org_id == org_id,
    ).order_by(EmployeeEducation.year_completed.desc().nullslast()).all()
    return [_education_to_dict(r) for r in rows]


@router.post("/{user_id}/education", status_code=201)
def create_education(
    user_id: uuid.UUID,
    body: EducationCreate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    e = EmployeeEducation(
        id=uuid.uuid4(),
        user_id=user_id,
        org_id=org_id,
        institution=body.institution.strip(),
        qualification=body.qualification.strip() if body.qualification else None,
        field_of_study=body.field_of_study.strip() if body.field_of_study else None,
        year_completed=body.year_completed,
        is_certification=body.is_certification,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return _education_to_dict(e)


@router.put("/{user_id}/education/{edu_id}")
def update_education(
    user_id: uuid.UUID,
    edu_id: uuid.UUID,
    body: EducationUpdate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    e = db.query(EmployeeEducation).filter(
        EmployeeEducation.id == edu_id,
        EmployeeEducation.user_id == user_id,
        EmployeeEducation.org_id == org_id,
    ).first()
    if not e:
        raise HTTPException(status_code=404, detail="Education record not found")
    for field in ("institution", "qualification", "field_of_study", "year_completed", "is_certification"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(e, field, val.strip() if isinstance(val, str) else val)
    db.commit()
    db.refresh(e)
    return _education_to_dict(e)


@router.delete("/{user_id}/education/{edu_id}")
def delete_education(
    user_id: uuid.UUID,
    edu_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    e = db.query(EmployeeEducation).filter(
        EmployeeEducation.id == edu_id,
        EmployeeEducation.user_id == user_id,
        EmployeeEducation.org_id == org_id,
    ).first()
    if not e:
        raise HTTPException(status_code=404, detail="Education record not found")
    db.delete(e)
    db.commit()
    return {"ok": True}


# ---------- Company Assets ----------

class AssetCreate(BaseModel):
    asset_type: str
    description: Optional[str] = None
    serial_number: Optional[str] = None
    assigned_date: Optional[str] = None
    returned_date: Optional[str] = None
    notes: Optional[str] = None


class AssetUpdate(BaseModel):
    asset_type: Optional[str] = None
    description: Optional[str] = None
    serial_number: Optional[str] = None
    assigned_date: Optional[str] = None
    returned_date: Optional[str] = None
    notes: Optional[str] = None


def _asset_to_dict(a: EmployeeAsset) -> dict:
    return {
        "id": str(a.id),
        "user_id": str(a.user_id),
        "org_id": str(a.org_id),
        "asset_type": a.asset_type,
        "description": a.description,
        "serial_number": a.serial_number,
        "assigned_date": a.assigned_date.isoformat() if a.assigned_date else None,
        "returned_date": a.returned_date.isoformat() if a.returned_date else None,
        "notes": a.notes,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


@router.get("/{user_id}/assets", response_model=List[dict])
def list_assets(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    rows = db.query(EmployeeAsset).filter(
        EmployeeAsset.user_id == user_id,
        EmployeeAsset.org_id == org_id,
    ).order_by(EmployeeAsset.assigned_date.desc().nullslast()).all()
    return [_asset_to_dict(r) for r in rows]


@router.post("/{user_id}/assets", status_code=201)
def create_asset(
    user_id: uuid.UUID,
    body: AssetCreate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    a = EmployeeAsset(
        id=uuid.uuid4(),
        user_id=user_id,
        org_id=org_id,
        asset_type=body.asset_type.strip(),
        description=body.description.strip() if body.description else None,
        serial_number=body.serial_number.strip() if body.serial_number else None,
        assigned_date=_parse_date(body.assigned_date),
        returned_date=_parse_date(body.returned_date),
        notes=body.notes.strip() if body.notes else None,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return _asset_to_dict(a)


@router.put("/{user_id}/assets/{asset_id}")
def update_asset(
    user_id: uuid.UUID,
    asset_id: uuid.UUID,
    body: AssetUpdate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    a = db.query(EmployeeAsset).filter(
        EmployeeAsset.id == asset_id,
        EmployeeAsset.user_id == user_id,
        EmployeeAsset.org_id == org_id,
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    for field in ("asset_type", "description", "serial_number", "notes"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(a, field, val.strip() if isinstance(val, str) else val)
    if body.assigned_date is not None:
        a.assigned_date = _parse_date(body.assigned_date)
    if body.returned_date is not None:
        a.returned_date = _parse_date(body.returned_date)
    db.commit()
    db.refresh(a)
    return _asset_to_dict(a)


@router.delete("/{user_id}/assets/{asset_id}")
def delete_asset(
    user_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    _ensure_employee_in_org(db, org_id, user_id)
    a = db.query(EmployeeAsset).filter(
        EmployeeAsset.id == asset_id,
        EmployeeAsset.user_id == user_id,
        EmployeeAsset.org_id == org_id,
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(a)
    db.commit()
    return {"ok": True}
