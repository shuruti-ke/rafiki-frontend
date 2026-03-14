"""
Kiosk mode — shared device / terminal clock-in and clock-out for non-digital employees.

No login required. Uses org_code + employee_identifier (email or employment number)
to identify the employee and record attendance.

Use in reception, staff rooms, or on a shared tablet. Optionally restrict by IP or
enable per-org in org settings.
"""
from typing import Optional
from datetime import datetime, timezone, date

from fastapi import APIRouter, Depends, HTTPException, Request, Body
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, Organization
from app.models.employee_profile import EmployeeProfile
from app.models.attendance import AttendanceLog

router = APIRouter(prefix="/api/v1/kiosk", tags=["Kiosk"])


class KioskClockBody(BaseModel):
    org_code: str
    employee_identifier: str  # email or employment_number


def _client_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def _find_employee(db: Session, org_code: str, identifier: str) -> Optional[User]:
    """Resolve org_code + employee_identifier to a User in that org. Identifier is email or employment_number."""
    org = db.query(Organization).filter(Organization.org_code == (org_code or "").strip()).first()
    if not org:
        return None
    identifier = (identifier or "").strip()
    if not identifier:
        return None
    # Try email first
    user = (
        db.query(User)
        .filter(User.org_id == org.org_id, User.email == identifier, User.is_active == True)
        .first()
    )
    if user:
        return user
    # Try employment_number via employee_profiles
    profile = (
        db.query(EmployeeProfile)
        .join(User, User.user_id == EmployeeProfile.user_id)
        .filter(
            EmployeeProfile.org_id == org.org_id,
            EmployeeProfile.employment_number == identifier,
            User.is_active == True,
        )
        .first()
    )
    if profile:
        return db.query(User).filter(User.user_id == profile.user_id).first()
    return None


def _to_dict(log: AttendanceLog) -> dict:
    return {
        "id": str(log.id),
        "user_id": str(log.user_id),
        "org_id": str(log.org_id),
        "work_date": log.work_date.isoformat() if log.work_date else "",
        "check_in": log.check_in.isoformat() if log.check_in else None,
        "check_out": log.check_out.isoformat() if log.check_out else None,
        "total_seconds": log.total_seconds,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


@router.post("/clock-in")
def kiosk_clock_in(
    request: Request,
    body: KioskClockBody = Body(...),
    db: Session = Depends(get_db),
):
    """
    Record clock-in for an employee using org code + email or employment number.
    No authentication required — for use on shared kiosk devices.
    """
    user = _find_employee(db, body.org_code, body.employee_identifier)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="Organization or employee not found. Check org code and employee ID or email.",
        )

    now = datetime.now(timezone.utc)
    today = now.date()

    active = db.query(AttendanceLog).filter(
        AttendanceLog.user_id == user.user_id,
        AttendanceLog.org_id == user.org_id,
        AttendanceLog.check_out.is_(None),
    ).first()

    if active:
        raise HTTPException(
            status_code=400,
            detail="Already clocked in. Please clock out first.",
        )

    log = AttendanceLog(
        user_id=user.user_id,
        org_id=user.org_id,
        work_date=today,
        check_in=now,
        check_in_ip_address=_client_ip(request),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {
        "ok": True,
        "message": "Clocked in",
        "employee_name": user.name or user.email or "Employee",
        "log": _to_dict(log),
    }


@router.post("/clock-out")
def kiosk_clock_out(
    request: Request,
    body: KioskClockBody = Body(...),
    db: Session = Depends(get_db),
):
    """
    Record clock-out for an employee using org code + email or employment number.
    No authentication required — for use on shared kiosk devices.
    """
    user = _find_employee(db, body.org_code, body.employee_identifier)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="Organization or employee not found. Check org code and employee ID or email.",
        )

    now = datetime.now(timezone.utc)

    active = db.query(AttendanceLog).filter(
        AttendanceLog.user_id == user.user_id,
        AttendanceLog.org_id == user.org_id,
        AttendanceLog.check_out.is_(None),
    ).order_by(AttendanceLog.check_in.desc()).first()

    if not active:
        raise HTTPException(
            status_code=400,
            detail="No active session. Please clock in first.",
        )

    active.check_out = now
    active.check_out_ip_address = _client_ip(request)
    if active.check_in:
        ci = active.check_in
        ci_utc = ci.replace(tzinfo=timezone.utc) if ci.tzinfo is None else ci
        active.total_seconds = int((now - ci_utc).total_seconds())

    db.commit()
    db.refresh(active)
    return {
        "ok": True,
        "message": "Clocked out",
        "employee_name": user.name or user.email or "Employee",
        "log": _to_dict(active),
    }


@router.get("/org-check")
def kiosk_org_check(
    org_code: str = "",
    db: Session = Depends(get_db),
):
    """
    Validate org code and return org name (for kiosk UI to show "Welcome, [Org Name]").
    Does not expose employee list — keeps kiosk flow as code + identifier.
    """
    org = db.query(Organization).filter(Organization.org_code == (org_code or "").strip()).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"org_code": org.org_code, "org_name": org.name}
