# backend/app/routers/employees.py

import csv
import io
import json
import os
import uuid
import secrets
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.dependencies import get_current_org_id, require_admin
from app.models.user import User  # users_legacy (UUID)
from app.models.employee_profile import EmployeeProfile
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
        initial_password=temp_pw,
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


@router.get("/{user_id}/credentials")
def get_credentials(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """Return the stored initial password for an employee (HR admin only)."""
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
    _role: str = Depends(require_admin),
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
