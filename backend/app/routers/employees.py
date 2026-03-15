# backend/app/routers/employees.py

import csv
import io
import json
import logging
import os
import uuid
import secrets
from datetime import date, datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import or_, text as sql_text
from sqlalchemy import func

logger = logging.getLogger(__name__)

from app.database import get_db
from app.dependencies import get_current_org_id, require_admin, require_manager, require_it_admin
from app.models.user import User  # users_legacy (UUID)
from app.models.employee_profile import EmployeeProfile
from app.models.org_profile import OrgProfile
from app.models.timesheet import TimesheetEntry
from app.models.objective import Objective
from app.models.calendar_event import CalendarEvent
from app.models.document import Document
from app.models.employee_document import EmployeeDocument
from app.models.announcement import Announcement
from app.models.performance import PerformanceEvaluation
from app.services.auth import get_password_hash

router = APIRouter(prefix="/api/v1/employees", tags=["Employee Management"])

# ---------- known fields for AI mapping ----------
KNOWN_FIELDS = [
    "email", "name", "department", "job_title", "phone",
    "employment_number", "national_id", "contract_type",
    "start_date", "status", "notes", "role",
    "duration_months", "evaluation_period_months",
]


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
    # Try multiple common formats
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(d.strip(), fmt).date()
        except ValueError:
            continue
    raise HTTPException(status_code=400, detail=f"Invalid date: {d}. Expected YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY")


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
        "can_process_payroll": bool(getattr(u, "can_process_payroll", False)),
        "can_approve_payroll": bool(getattr(u, "can_approve_payroll", False)),
        "can_authorize_payroll": bool(getattr(u, "can_authorize_payroll", False)),
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
        "employment_type": p.employment_type,
        "work_location": p.work_location,
        "job_description": p.job_description,

        "contract_type": p.contract_type,
        "contract_start": p.contract_start,
        "contract_end": p.contract_end,

        "targets": p.targets,
        "monthly_salary": float(p.monthly_salary) if getattr(p, "monthly_salary", None) is not None else None,

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
        "gender": getattr(p, "gender", None),
        "marital_status": getattr(p, "marital_status", None),
        "number_of_dependents": getattr(p, "number_of_dependents", None),

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
    employment_type: Optional[str] = None
    work_location: Optional[str] = None
    manager_id: Optional[str] = None

    # employee_profiles (existing + new)
    employment_number: Optional[str] = None
    national_id: Optional[str] = None
    job_description: Optional[str] = None
    contract_type: Optional[str] = None
    contract_start: Optional[str] = None
    contract_end: Optional[str] = None
    targets: Optional[str] = None
    monthly_salary: Optional[float] = None
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
    gender: Optional[str] = None  # 'male' | 'female' | 'other'

    temporary_password: Optional[str] = None


class EmployeeUpdateRequest(BaseModel):
    # users_legacy fields
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    role: Optional[str] = None
    language_preference: Optional[str] = None  # ✅ NEW
    department: Optional[str] = None
    job_title: Optional[str] = None
    employment_type: Optional[str] = None
    work_location: Optional[str] = None
    manager_id: Optional[str] = None
    is_active: Optional[bool] = None
    gender: Optional[str] = None  # 'male' | 'female' | 'other' — used for leave entitlements
    can_process_payroll: Optional[bool] = None
    can_approve_payroll: Optional[bool] = None
    can_authorize_payroll: Optional[bool] = None

    # employee_profiles fields
    employment_number: Optional[str] = None
    national_id: Optional[str] = None
    job_description: Optional[str] = None
    contract_type: Optional[str] = None
    contract_start: Optional[str] = None
    contract_end: Optional[str] = None
    targets: Optional[str] = None
    monthly_salary: Optional[float] = None
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
    marital_status: Optional[str] = None
    number_of_dependents: Optional[int] = None


# ---------- endpoints ----------

@router.get("/")
def list_employees(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    search: Optional[str] = Query(default=None),
    department: Optional[str] = Query(default=None),
    job_title: Optional[str] = Query(default=None),
    include_inactive: bool = Query(default=False, description="When true, include inactive employees (used for search)"),
):
    q = db.query(User).filter(User.org_id == org_id)

    # By default, hide inactive users from the org-wide employee list and counts
    if not include_inactive:
        q = q.filter(User.is_active.is_(True))

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


@router.get("/meta/options")
def employee_form_options(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    """Return configurable dropdown options for employee forms."""
    profile = db.query(OrgProfile).filter(OrgProfile.org_id == org_id).first()
    configured_departments = []
    if profile and isinstance(getattr(profile, "departments", None), list):
        configured_departments = [str(d).strip() for d in profile.departments if str(d).strip()]

    existing_departments = [
        row[0]
        for row in db.query(User.department)
        .filter(User.org_id == org_id, User.department.isnot(None))
        .distinct()
        .all()
        if row[0]
    ]
    departments = sorted(set(configured_departments + existing_departments), key=lambda x: x.lower())

    return {
        "departments": departments,
        "employment_types": ["Permanent", "Contract", "Part-time", "Trainee", "Intern", "Consultant"],
        "work_locations": ["Office", "Remote", "Hybrid", "Field", "Branch"],
        "roles": ["user", "manager", "hr_admin", "super_admin"],
    }


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
        employment_type=body.employment_type,
        work_location=body.work_location,
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
        initial_password=temp_pw,
        gender=body.gender or None,
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


# ---------- batch endpoints (must be before /{user_id}) ----------

@router.get("/template.csv")
def download_template(
    _role: str = Depends(require_admin),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    """Download a CSV template for batch employee upload."""
    template_headers = [
        "email", "name", "department", "job_title", "phone",
        "employment_number", "national_id", "contract_type",
        "start_date", "status", "notes", "role",
        "duration_months", "evaluation_period_months",
    ]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(template_headers)
    writer.writerow([
        "jane@company.com", "Jane Doe", "Engineering", "Software Engineer",
        "+1234567890", "EMP001", "ID12345", "permanent",
        "2024-01-15", "active", "", "user", "12", "3",
    ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=employees_template.csv"},
    )


@router.post("/batch-upload")
async def batch_upload_employees(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """
    Upload CSV or XLSX with employee data. AI maps column headers to known fields.
    Returns summary of created, skipped, and errored rows.
    """
    content = await file.read()
    filename = (file.filename or "").lower()

    try:
        if filename.endswith(".xlsx") or filename.endswith(".xls"):
            file_headers, rows = _parse_xlsx_bytes(content)
        else:
            file_headers, rows = _parse_csv_bytes(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    if not file_headers:
        raise HTTPException(status_code=400, detail="File has no headers")

    col_map = _map_headers_ai(file_headers)

    # Validate that the file has at least an email column — payroll files won't
    if "email" not in col_map.values():
        raise HTTPException(
            status_code=400,
            detail=(
                f"No email column detected in this file. "
                f"Found headers: {', '.join(file_headers[:10])}. "
                "The employee import file must contain an email column. "
                "Download the template CSV for the expected format."
            ),
        )

    results = {"created": [], "skipped": [], "errors": []}

    for i, row in enumerate(rows):
        if all(not v for v in row.values()):
            continue
        mapped = {}
        for csv_col, field in col_map.items():
            val = row.get(csv_col, "")
            if val and str(val).strip():
                mapped[field] = str(val).strip()
        try:
            result = _create_one(db, org_id, mapped)
            if result["status"] == "created":
                results["created"].append(result)
            elif result["status"] == "skipped":
                results["skipped"].append(result)
            else:
                results["errors"].append({**result, "row": i + 2})
        except Exception as e:
            db.rollback()
            results["errors"].append({"row": i + 2, "email": mapped.get("email", ""), "reason": str(e)})
            continue

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB commit failed: {e}")

    return {
        "summary": {
            "total_rows": len(rows),
            "created": len(results["created"]),
            "skipped": len(results["skipped"]),
            "errors": len(results["errors"]),
        },
        "column_mapping": col_map,
        "created": results["created"],
        "skipped": results["skipped"],
        "errors": results["errors"],
    }


@router.get("/analytics")
def employee_analytics(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Org-wide analytics for HR admin / manager dashboard."""
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    thirty_days_ago = now - __import__("datetime").timedelta(days=30)

    result = {}

    # ── Employees ──
    try:
        users = db.query(User).filter(User.org_id == org_id).all()
        active = [u for u in users if getattr(u, "is_active", True)]
        dept_counts = {}
        role_counts = {}
        new_this_month = 0
        month_start_date = month_start.date()
        for u in users:
            d = getattr(u, "department", None) or "Unassigned"
            dept_counts[d] = dept_counts.get(d, 0) + 1
            r = str(u.role) if u.role else "user"
            role_counts[r] = role_counts.get(r, 0) + 1
            raw_created = getattr(u, "created_at", None)
            if raw_created:
                created_date = raw_created.date() if hasattr(raw_created, "date") else raw_created
                if created_date >= month_start_date:
                    new_this_month += 1
        result["employees"] = {
            "total": len(users),
            "active": len(active),
            "by_department": dept_counts,
            "by_role": role_counts,
            "new_this_month": new_this_month,
        }
    except Exception as e:
        logger.error("Analytics employees block failed: %s", e, exc_info=True)
        result["employees"] = None

    # ── Timesheets (last 30 days) ──
    try:
        entries = (
            db.query(TimesheetEntry)
            .filter(TimesheetEntry.org_id == org_id, TimesheetEntry.date >= thirty_days_ago.date())
            .all()
        )
        total_hours = sum(float(e.hours or 0) for e in entries)
        unique_days = len(set(e.date for e in entries if e.date))
        by_project = {}
        by_category = {}
        for e in entries:
            p = e.project or "Uncategorized"
            by_project[p] = by_project.get(p, 0) + float(e.hours or 0)
            c = e.category or "General"
            by_category[c] = by_category.get(c, 0) + float(e.hours or 0)
        result["timesheets"] = {
            "total_hours_30d": round(total_hours, 1),
            "avg_daily": round(total_hours / max(unique_days, 1), 1),
            "by_project": by_project,
            "by_category": by_category,
        }
    except Exception as e:
        logger.error("Analytics timesheets block failed: %s", e, exc_info=True)
        result["timesheets"] = None

    # ── Objectives ──
    try:
        objectives = db.query(Objective).filter(Objective.org_id == org_id).all()
        by_status = {}
        progress_sum = 0
        for o in objectives:
            s = getattr(o, "status", "draft") or "draft"
            by_status[s] = by_status.get(s, 0) + 1
            progress_sum += float(getattr(o, "progress", 0) or 0)
        result["objectives"] = {
            "total": len(objectives),
            "by_status": by_status,
            "avg_progress": round(progress_sum / max(len(objectives), 1), 1),
        }
    except Exception as e:
        logger.error("Analytics objectives block failed: %s", e, exc_info=True)
        result["objectives"] = None

    # ── Calendar Events (this month) ──
    try:
        events = (
            db.query(CalendarEvent)
            .filter(CalendarEvent.org_id == org_id, CalendarEvent.start_time >= month_start)
            .all()
        )
        by_type = {}
        for e in events:
            t = getattr(e, "event_type", "other") or "other"
            by_type[t] = by_type.get(t, 0) + 1
        result["calendar"] = {"events_this_month": len(events), "by_type": by_type}
    except Exception as e:
        logger.error("Analytics calendar block failed: %s", e, exc_info=True)
        result["calendar"] = None

    # ── Documents ──
    try:
        kb_count = db.query(func.count(Document.id)).filter(Document.org_id == org_id).scalar() or 0
        emp_doc_count = db.query(func.count(EmployeeDocument.id)).filter(EmployeeDocument.org_id == org_id).scalar() or 0
        result["documents"] = {"kb_doc_count": kb_count, "employee_doc_count": emp_doc_count}
    except Exception as e:
        logger.error("Analytics documents block failed: %s", e, exc_info=True)
        result["documents"] = None

    # ── Announcements ──
    try:
        total_ann = db.query(func.count(Announcement.id)).filter(Announcement.org_id == org_id).scalar() or 0
        recent_ann = (
            db.query(func.count(Announcement.id))
            .filter(Announcement.org_id == org_id, Announcement.created_at >= thirty_days_ago)
            .scalar() or 0
        )
        result["announcements"] = {"total": total_ann, "recent_count": recent_ann}
    except Exception as e:
        logger.error("Analytics announcements block failed: %s", e, exc_info=True)
        result["announcements"] = None

    # ── Timesheet Submissions (current week Mon-Sun) ──
    try:
        today = now.date()
        week_start = today - timedelta(days=today.weekday())  # Monday
        week_end = week_start + timedelta(days=6)  # Sunday

        active_users = db.query(User).filter(
            User.org_id == org_id,
            User.is_active == True,
        ).all()

        # Get all timesheet entries for this week with submitted/approved status
        week_entries = (
            db.query(TimesheetEntry.user_id, func.sum(TimesheetEntry.hours))
            .filter(
                TimesheetEntry.org_id == org_id,
                TimesheetEntry.date >= week_start,
                TimesheetEntry.date <= week_end,
                TimesheetEntry.status.in_(["submitted", "approved"]),
            )
            .group_by(TimesheetEntry.user_id)
            .all()
        )
        submitted_map = {row[0]: float(row[1] or 0) for row in week_entries}

        staff = []
        submitted_count = 0
        for u in active_users:
            has_submitted = u.user_id in submitted_map
            hours = submitted_map.get(u.user_id, 0)
            if has_submitted:
                submitted_count += 1
            staff.append({
                "user_id": str(u.user_id),
                "name": u.name or u.email or "Unknown",
                "department": getattr(u, "department", None),
                "submitted": has_submitted,
                "hours_this_week": round(hours, 1),
            })

        result["timesheet_submissions"] = {
            "submitted_count": submitted_count,
            "not_submitted_count": len(active_users) - submitted_count,
            "staff": staff,
        }
    except Exception as e:
        logger.error("Analytics timesheet_submissions block failed: %s", e, exc_info=True)
        result["timesheet_submissions"] = None

    return result


@router.get("/{user_id}/dashboard-summary")
def get_employee_dashboard_summary(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """HR: summary counts for an employee's dashboard (objectives, documents, last evaluation). No chat data."""
    u = db.query(User).filter(User.user_id == user_id, User.org_id == org_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")

    objectives_count = db.query(Objective).filter(
        Objective.user_id == user_id,
        Objective.org_id == org_id,
    ).count()

    documents_count = db.query(EmployeeDocument).filter(
        EmployeeDocument.user_id == user_id,
        EmployeeDocument.org_id == org_id,
    ).count()

    latest_eval = (
        db.query(PerformanceEvaluation)
        .filter(
            PerformanceEvaluation.user_id == user_id,
            PerformanceEvaluation.org_id == org_id,
        )
        .order_by(PerformanceEvaluation.created_at.desc())
        .first()
    )

    return {
        "objectives_count": objectives_count,
        "documents_count": documents_count,
        "last_evaluation_rating": latest_eval.overall_rating if latest_eval else None,
        "evaluations_count": db.query(PerformanceEvaluation).filter(
            PerformanceEvaluation.user_id == user_id,
            PerformanceEvaluation.org_id == org_id,
        ).count(),
    }


def _build_employee_review_context(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> str:
    """Build a structured text summary of the employee's data for AI review. No chat content."""
    from app.models.objective import KeyResult

    u = db.query(User).filter(User.user_id == user_id, User.org_id == org_id).first()
    if not u:
        return ""
    parts = [
        f"Employee: {u.name or u.email}",
        f"Role: {getattr(u, 'role', 'user')}",
        f"Department: {getattr(u, 'department', '') or '—'}",
        f"Job title: {getattr(u, 'job_title', '') or '—'}",
    ]

    objs = (
        db.query(Objective)
        .filter(Objective.user_id == user_id, Objective.org_id == org_id, Objective.status.in_(["active", "pending_review", "draft"]))
        .order_by(Objective.created_at.desc())
        .limit(10)
        .all()
    )
    if objs:
        parts.append("\nObjectives / OKRs:")
        for o in objs:
            parts.append(f"  - {o.title} | progress {o.progress}% | due {o.target_date}")
            krs = db.query(KeyResult).filter(KeyResult.objective_id == o.id).all()
            for kr in krs:
                pct = (int(kr.current_value / kr.target_value * 100) if kr.target_value else 0)
                parts.append(f"    Key result: {kr.title} {kr.current_value}/{kr.target_value} ({pct}%)")
    else:
        parts.append("\nObjectives: None on record.")

    evals = (
        db.query(PerformanceEvaluation)
        .filter(PerformanceEvaluation.user_id == user_id, PerformanceEvaluation.org_id == org_id)
        .order_by(PerformanceEvaluation.created_at.desc())
        .limit(5)
        .all()
    )
    if evals:
        parts.append("\nPerformance evaluations:")
        for e in evals:
            parts.append(f"  - {e.evaluation_period}: rating {e.overall_rating}/5")
            if e.strengths:
                parts.append(f"    Strengths: {e.strengths[:200]}{'…' if len(e.strengths) > 200 else ''}")
            if e.areas_for_improvement:
                parts.append(f"    Areas for improvement: {e.areas_for_improvement[:200]}{'…' if len(e.areas_for_improvement) > 200 else ''}")
    else:
        parts.append("\nPerformance evaluations: None on record.")

    try:
        coaching_rows = db.execute(
            sql_text("""
                SELECT concern, created_at, outcome_logged
                FROM coaching_sessions
                WHERE org_id = :org AND employee_member_id = :uid
                ORDER BY created_at DESC
                LIMIT 10
            """),
            {"org": str(org_id), "uid": str(user_id)},
        ).mappings().all()
        if coaching_rows:
            parts.append("\nCoaching sessions:")
            for row in coaching_rows:
                parts.append(f"  - {row.get('created_at')}: {str(row.get('concern') or '')[:100]} | outcome: {row.get('outcome_logged') or '—'}")
        else:
            parts.append("\nCoaching sessions: None on record.")
    except Exception:
        parts.append("\nCoaching sessions: (data unavailable)")

    docs = (
        db.query(EmployeeDocument)
        .filter(EmployeeDocument.user_id == user_id, EmployeeDocument.org_id == org_id)
        .all()
    )
    if docs:
        by_type = {}
        for d in docs:
            by_type[d.doc_type or "other"] = by_type.get(d.doc_type or "other", 0) + 1
        parts.append("\nDocuments: " + ", ".join(f"{k}({v})" for k, v in sorted(by_type.items())))
    else:
        parts.append("\nDocuments: None on record.")

    try:
        bal_rows = db.execute(
            sql_text("""
                SELECT leave_type, entitled_days, used_days, carried_over_days
                FROM leave_balances
                WHERE user_id = :uid AND leave_year = :yr
            """),
            {"uid": str(user_id), "yr": date.today().year},
        ).mappings().all()
        if bal_rows:
            parts.append("\nLeave balance (this year):")
            for b in bal_rows:
                avail = float(b["entitled_days"]) + float(b.get("carried_over_days") or 0) - float(b["used_days"])
                parts.append(f"  {b['leave_type']}: {max(0, avail):.1f} days available")
    except Exception:
        pass

    cutoff = date.today() - timedelta(days=30)
    entries = (
        db.query(TimesheetEntry)
        .filter(TimesheetEntry.user_id == user_id, TimesheetEntry.date >= cutoff)
        .all()
    )
    if entries:
        total_h = sum(float(e.hours) for e in entries)
        parts.append(f"\nTimesheet (last 30 days): {total_h:.1f} hours logged.")
    else:
        parts.append("\nTimesheet (last 30 days): No entries.")

    return "\n".join(parts)


def _generate_ai_review(context: str, employee_name: str) -> str:
    """Call OpenAI to generate an HR review. Returns empty string if API unavailable."""
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    base = (os.getenv("OPENAI_BASE_URL", "https://api.openai.com").strip().rstrip("/"))
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
    if not api_key:
        return ""
    url = f"{base}/v1/chat/completions" if "/v1" not in base else f"{base}/chat/completions"
    system = (
        "You are an HR analyst. Based on the structured data provided about an employee, "
        "write a concise review (2–4 short paragraphs) covering: (1) overall performance and objectives progress, "
        "(2) wellbeing and engagement indicators, (3) any risks or issues to flag, (4) 1–2 concrete recommendations. "
        "Do not invent data. Only use information present in the data. Be direct and useful for HR monitoring."
    )
    user_msg = f"Employee: {employee_name}\n\nData:\n{context}"
    try:
        with httpx.Client() as client:
            r = client.post(
                url,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
                json={
                    "model": model,
                    "max_tokens": 1024,
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user_msg}],
                    "temperature": 0.3,
                },
                timeout=45,
            )
        if r.status_code >= 400:
            logger.warning("AI review OpenAI error: %d %s", r.status_code, r.text[:300])
            return ""
        data = r.json()
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
        return (content or "").strip()
    except Exception as e:
        logger.warning("AI review request failed: %s", e)
        return ""


@router.get("/{user_id}/ai-review")
def get_employee_ai_review(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """HR: AI-generated review of the employee based on objectives, KPIs, evaluations, coaching, documents, leave, timesheet. No chat content."""
    u = db.query(User).filter(User.user_id == user_id, User.org_id == org_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")
    context = _build_employee_review_context(db, org_id, user_id)
    review = _generate_ai_review(context, u.name or u.email or "Employee")
    return {
        "review": review or "AI review is not available (check OPENAI_API_KEY). Use the data below for manual insight.",
        "generated_at": datetime.utcnow().isoformat() + "Z",
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
    result = _combined(u, p)

    # Read gender via raw SQL — guards against ORM model not having column mapped
    from sqlalchemy import text as _text
    row = db.execute(
        _text("SELECT gender FROM employee_profiles WHERE user_id = :uid AND org_id = :org"),
        {"uid": str(user_id), "org": str(org_id)}
    ).first()
    if row:
        result["profile"] = result.get("profile") or {}
        result["profile"]["gender"] = row[0]

    return result


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
    if body.can_process_payroll is not None:
        u.can_process_payroll = body.can_process_payroll
    if body.can_approve_payroll is not None:
        u.can_approve_payroll = body.can_approve_payroll
    if body.can_authorize_payroll is not None:
        u.can_authorize_payroll = body.can_authorize_payroll

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
        "monthly_salary",
        "status", "duration_months", "evaluation_period_months",
        "terms_of_service_title", "terms_of_service_text",
        "address_line1", "address_line2", "city", "state", "postal_code", "country",
        "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship",
        "notes", "gender", "employment_type", "work_location",
        "marital_status", "number_of_dependents",
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

    # Flush ORM changes first, then apply gender via raw SQL
    # (guards against gender not being a declared SQLAlchemy column yet)
    db.flush()
    if body.gender is not None:
        from sqlalchemy import text as _text
        db.execute(
            _text("UPDATE employee_profiles SET gender = :g WHERE user_id = :uid AND org_id = :org"),
            {"g": body.gender or None, "uid": str(user_id), "org": str(org_id)}
        )

    db.commit()
    db.refresh(u)
    db.refresh(p)

    # Re-read gender from DB since ORM model may not have the column mapped
    from sqlalchemy import text as _text2
    row = db.execute(
        _text2("SELECT gender FROM employee_profiles WHERE user_id = :uid AND org_id = :org"),
        {"uid": str(user_id), "org": str(org_id)}
    ).first()
    result = _combined(u, p)
    if row:
        result["profile"] = result.get("profile") or {}
        result["profile"]["gender"] = row[0]
    return result


@router.patch("/{user_id}")
def patch_employee(
    user_id: uuid.UUID,
    body: EmployeeUpdateRequest,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """PATCH alias for PUT — supports partial updates including gender."""
    return update_employee(user_id, body, db, org_id, _role)


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


@router.get("/{user_id}/credentials")
def get_credentials(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_it_admin),
):
    """Return the stored initial password for an employee (IT/HR admin only)."""
    u = db.query(User).filter(User.user_id == user_id, User.org_id == org_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
    return {
        "user_id": str(user_id),
        "email": u.email,
        "initial_password": getattr(profile, "initial_password", None) if profile else None,
    }


@router.post("/{user_id}/reset-password")
def reset_employee_password(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_it_admin),
):
    """Generate a new temporary password for an employee and store it on their profile."""
    u = db.query(User).filter(User.user_id == user_id, User.org_id == org_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")

    new_pw = secrets.token_urlsafe(10)
    u.password_hash = get_password_hash(new_pw)

    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
    if profile:
        profile.initial_password = new_pw

    db.commit()
    return {
        "ok": True,
        "user_id": str(user_id),
        "email": u.email,
        "temporary_password": new_pw,
    }


# ---------- batch upload helpers ----------

def _map_headers_heuristic(headers: list[str]) -> dict[str, str]:
    """Return {csv_header: known_field} using simple keyword matching."""
    mapping = {}
    lower_to_field = {
        "email": "email", "e-mail": "email", "e mail": "email",
        "name": "name", "full name": "name", "fullname": "name", "full_name": "name",
        "department": "department", "dept": "department",
        "job title": "job_title", "job_title": "job_title", "jobtitle": "job_title",
        "position": "job_title", "title": "job_title",
        "phone": "phone", "mobile": "phone", "telephone": "phone",
        "employment number": "employment_number", "employment_number": "employment_number",
        "emp no": "employment_number", "emp number": "employment_number",
        "national id": "national_id", "national_id": "national_id", "id number": "national_id",
        "contract type": "contract_type", "contract_type": "contract_type",
        "start date": "start_date", "start_date": "start_date", "date joined": "start_date",
        "status": "status",
        "notes": "notes", "note": "notes", "remarks": "notes",
        "role": "role",
        "duration months": "duration_months", "duration_months": "duration_months",
        "evaluation period": "evaluation_period_months", "evaluation_period_months": "evaluation_period_months",
    }
    for h in headers:
        key = h.strip().lower()
        if key in lower_to_field:
            mapping[h] = lower_to_field[key]
    return mapping


def _map_headers_ai(headers: list[str]) -> dict[str, str]:
    """Use OpenAI to map arbitrary headers to known fields."""
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
    if not api_key:
        return _map_headers_heuristic(headers)
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key, base_url=base_url)
        prompt = (
            f"You are mapping CSV column headers to known employee fields.\n"
            f"Known fields: {json.dumps(KNOWN_FIELDS)}\n"
            f"CSV headers: {json.dumps(headers)}\n"
            f"Return ONLY a JSON object mapping each CSV header to the best known field, "
            f"or null if no match. Example: {{\"Email Address\": \"email\", \"Dept\": \"department\", \"Age\": null}}"
        )
        resp = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=500,
            response_format={"type": "json_object"},
        )
        raw = json.loads(resp.choices[0].message.content)
        return {k: v for k, v in raw.items() if v in KNOWN_FIELDS}
    except Exception:
        return _map_headers_heuristic(headers)


def _parse_csv_bytes(content: bytes) -> tuple[list[str], list[dict]]:
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    rows = list(reader)
    return list(headers), rows


def _parse_xlsx_bytes(content: bytes) -> tuple[list[str], list[dict]]:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active

    all_rows = list(ws.iter_rows(values_only=True))

    # Find the best header row in the first 15 rows: the row with the most non-empty
    # string-like cells. This skips leading empty rows and title/metadata rows.
    header_idx = None
    best_count = 0
    for i, row in enumerate(all_rows[:15]):
        non_empty = [c for c in row if c is not None and str(c).strip() != "" and not isinstance(c, (int, float))]
        if len(non_empty) > best_count:
            best_count = len(non_empty)
            header_idx = i

    if header_idx is None or best_count < 2:
        return [], []

    raw_headers = all_rows[header_idx]
    headers = [str(h).strip() if h is not None else "" for h in raw_headers]

    rows = []
    for row in all_rows[header_idx + 1:]:
        # Skip entirely empty rows
        if all(c is None or str(c).strip() == "" for c in row):
            continue
        rows.append({headers[i]: (str(v).strip() if v is not None else "") for i, v in enumerate(row) if i < len(headers)})
    return headers, rows


def _create_one(db: Session, org_id: uuid.UUID, row_mapped: dict) -> dict:
    """Create a single employee from a mapped row dict. Returns result info."""
    email = (row_mapped.get("email") or "").strip().lower()
    if not email:
        return {"status": "error", "reason": "missing email"}

    existing = db.query(User).filter(User.org_id == org_id, User.email == email).first()
    if existing:
        return {"status": "skipped", "email": email, "reason": "already exists"}

    temp_pw = secrets.token_urlsafe(10)
    u = User(
        user_id=uuid.uuid4(),
        org_id=org_id,
        anonymous_alias=_make_alias(),
        email=email,
        password_hash=get_password_hash(temp_pw),
        role=row_mapped.get("role") or "user",
        language_preference="en",
        is_active=True,
        name=row_mapped.get("name") or None,
        department=row_mapped.get("department") or None,
        job_title=row_mapped.get("job_title") or None,
    )
    db.add(u)
    db.flush()

    p = EmployeeProfile(
        id=uuid.uuid4(),
        user_id=u.user_id,
        org_id=org_id,
        employment_number=row_mapped.get("employment_number") or None,
        national_id=row_mapped.get("national_id") or None,
        job_title=row_mapped.get("job_title") or None,
        department=row_mapped.get("department") or None,
        phone=row_mapped.get("phone") or None,
        contract_type=row_mapped.get("contract_type") or None,
        status=row_mapped.get("status") or "active",
        start_date=_parse_date(row_mapped.get("start_date")),
        notes=row_mapped.get("notes") or None,
        initial_password=temp_pw,
        duration_months=int(row_mapped["duration_months"]) if row_mapped.get("duration_months") else None,
        evaluation_period_months=int(row_mapped["evaluation_period_months"]) if row_mapped.get("evaluation_period_months") else None,
    )
    db.add(p)

    return {"status": "created", "email": email, "temporary_password": temp_pw}
