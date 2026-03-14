"""
Employee Attendance Tracking — clock-in/out with server-side timestamps.

Data integrity:
- No double check-in: reject if user has active session (check_out IS NULL)
- No check-out without prior check-in: reject if no active session
"""

import uuid
from datetime import datetime, date, timezone
from typing import Optional, List

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import (
    get_current_user_id, get_current_org_id, require_manager,
    get_current_user, require_can_act_for_employee,
)
from app.models.attendance import AttendanceLog
from app.models.user import User

router = APIRouter(prefix="/api/v1/attendance", tags=["attendance"])


# ──────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────


class ClockInRequest(BaseModel):
    """Optional geolocation for check-in (frontend can send if available)."""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[int] = None


class ClockOutRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[int] = None


class OnBehalfRequest(BaseModel):
    """Request body for clock-in/out on behalf of an employee."""
    employee_id: uuid.UUID
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[int] = None


class AttendanceLogOut(BaseModel):
    id: str
    user_id: str
    org_id: str
    work_date: str
    check_in: str
    check_out: Optional[str]
    total_seconds: Optional[int]
    created_at: str

    class Config:
        from_attributes = True


def _to_dict(log: AttendanceLog) -> dict:
    d = {
        "id": str(log.id),
        "user_id": str(log.user_id),
        "org_id": str(log.org_id),
        "work_date": log.work_date.isoformat() if log.work_date else "",
        "check_in": log.check_in.isoformat() if log.check_in else None,
        "check_out": log.check_out.isoformat() if log.check_out else None,
        "total_seconds": log.total_seconds,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }
    if log.check_in_lat is not None and log.check_in_long is not None:
        d["check_in_lat"] = float(log.check_in_lat)
        d["check_in_long"] = float(log.check_in_long)
        d["check_in_accuracy"] = log.check_in_accuracy
    d["check_in_ip_address"] = log.check_in_ip_address
    if log.check_out_lat is not None and log.check_out_long is not None:
        d["check_out_lat"] = float(log.check_out_lat)
        d["check_out_long"] = float(log.check_out_long)
        d["check_out_accuracy"] = log.check_out_accuracy
    d["check_out_ip_address"] = log.check_out_ip_address
    return d


# ──────────────────────────────────────────────
# Static routes (before /{log_id})
# ──────────────────────────────────────────────


def _client_ip(request: Request) -> Optional[str]:
    """Get client IP from X-Forwarded-For or direct connection."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/clock-in")
def clock_in(
    request: Request,
    body: Optional[ClockInRequest] = Body(default=None),
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    """
    Record check-in. Server timestamp is authoritative.
    Rejects if already clocked in (no prior check-out).
    """
    now = datetime.now(timezone.utc)
    today = now.date()

    # Data integrity: prevent double check-in
    active = db.query(AttendanceLog).filter(
        AttendanceLog.user_id == user_id,
        AttendanceLog.org_id == org_id,
        AttendanceLog.check_out.is_(None),
    ).first()

    if active:
        raise HTTPException(
            status_code=400,
            detail="Already clocked in. Please clock out first.",
        )

    log = AttendanceLog(
        user_id=user_id,
        org_id=org_id,
        work_date=today,
        check_in=now,
        check_in_lat=body.latitude if body else None,
        check_in_long=body.longitude if body else None,
        check_in_accuracy=body.accuracy if body else None,
        check_in_ip_address=_client_ip(request),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"ok": True, "message": "Clocked in", "log": _to_dict(log)}


@router.post("/clock-out")
def clock_out(
    request: Request,
    body: Optional[ClockOutRequest] = Body(default=None),
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    """
    Record check-out. Server timestamp is authoritative.
    Rejects if no active session (must clock in first).
    """
    now = datetime.now(timezone.utc)

    # Data integrity: must have active session to clock out
    active = db.query(AttendanceLog).filter(
        AttendanceLog.user_id == user_id,
        AttendanceLog.org_id == org_id,
        AttendanceLog.check_out.is_(None),
    ).order_by(AttendanceLog.check_in.desc()).first()

    if not active:
        raise HTTPException(
            status_code=400,
            detail="No active session. Please clock in first.",
        )

    active.check_out = now
    active.check_out_lat = body.latitude if body else None
    active.check_out_long = body.longitude if body else None
    active.check_out_accuracy = body.accuracy if body else None
    active.check_out_ip_address = _client_ip(request)

    if active.check_in:
        delta = now - active.check_in.replace(tzinfo=timezone.utc) if active.check_in.tzinfo is None else now - active.check_in
        active.total_seconds = int(delta.total_seconds())

    db.commit()
    db.refresh(active)
    return {"ok": True, "message": "Clocked out", "log": _to_dict(active)}


@router.get("/status")
def get_status(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    """Return current attendance status: clocked_in or clocked_out."""
    active = db.query(AttendanceLog).filter(
        AttendanceLog.user_id == user_id,
        AttendanceLog.org_id == org_id,
        AttendanceLog.check_out.is_(None),
    ).order_by(AttendanceLog.check_in.desc()).first()

    if active:
        return {
            "status": "clocked_in",
            "check_in": active.check_in.isoformat() if active.check_in else None,
            "log_id": str(active.id),
        }
    return {"status": "clocked_out"}


@router.get("/")
def list_my_logs(
    start: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    """Individual log history for the current user."""
    q = db.query(AttendanceLog).filter(
        AttendanceLog.user_id == user_id,
        AttendanceLog.org_id == org_id,
    )
    if start:
        try:
            q = q.filter(AttendanceLog.work_date >= date.fromisoformat(start[:10]))
        except ValueError:
            pass
    if end:
        try:
            q = q.filter(AttendanceLog.work_date <= date.fromisoformat(end[:10]))
        except ValueError:
            pass
    logs = q.order_by(AttendanceLog.work_date.desc(), AttendanceLog.check_in.desc()).limit(limit).all()
    return [_to_dict(l) for l in logs]


@router.post("/clock-in-on-behalf")
def clock_in_on_behalf(
    request: Request,
    body: OnBehalfRequest,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user: Optional[User] = Depends(get_current_user),
    _role: str = Depends(require_manager),
):
    """Manager or admin clocks in on behalf of an employee (proxy for non-digital staff)."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    require_can_act_for_employee(db, current_user, body.employee_id)
    employee_id = body.employee_id

    now = datetime.now(timezone.utc)
    today = now.date()

    active = db.query(AttendanceLog).filter(
        AttendanceLog.user_id == employee_id,
        AttendanceLog.org_id == org_id,
        AttendanceLog.check_out.is_(None),
    ).first()

    if active:
        raise HTTPException(
            status_code=400,
            detail="Employee is already clocked in. Please clock out first.",
        )

    log = AttendanceLog(
        user_id=employee_id,
        org_id=org_id,
        work_date=today,
        check_in=now,
        check_in_lat=body.latitude,
        check_in_long=body.longitude,
        check_in_accuracy=body.accuracy,
        check_in_ip_address=_client_ip(request),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"ok": True, "message": "Clocked in on behalf of employee", "log": _to_dict(log)}


@router.post("/clock-out-on-behalf")
def clock_out_on_behalf(
    request: Request,
    body: OnBehalfRequest,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user: Optional[User] = Depends(get_current_user),
    _role: str = Depends(require_manager),
):
    """Manager or admin clocks out on behalf of an employee (proxy for non-digital staff)."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    require_can_act_for_employee(db, current_user, body.employee_id)
    employee_id = body.employee_id

    now = datetime.now(timezone.utc)

    active = db.query(AttendanceLog).filter(
        AttendanceLog.user_id == employee_id,
        AttendanceLog.org_id == org_id,
        AttendanceLog.check_out.is_(None),
    ).order_by(AttendanceLog.check_in.desc()).first()

    if not active:
        raise HTTPException(
            status_code=400,
            detail="No active session for this employee. Please clock in first.",
        )

    active.check_out = now
    active.check_out_lat = body.latitude
    active.check_out_long = body.longitude
    active.check_out_accuracy = body.accuracy
    active.check_out_ip_address = _client_ip(request)

    if active.check_in:
        ci = active.check_in
        ci_utc = ci.replace(tzinfo=timezone.utc) if ci.tzinfo is None else ci
        active.total_seconds = int((now - ci_utc).total_seconds())

    db.commit()
    db.refresh(active)
    return {"ok": True, "message": "Clocked out on behalf of employee", "log": _to_dict(active)}


@router.get("/team")
def list_team_logs(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    user_id_filter: Optional[str] = Query(None, alias="user_id"),
    limit: int = Query(100, ge=1, le=500),
    role: str = Depends(require_manager),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    """List attendance logs for org (managers/admins). Optionally filter by user_id."""
    q = db.query(AttendanceLog).filter(AttendanceLog.org_id == org_id)
    if user_id_filter:
        try:
            uid = uuid.UUID(user_id_filter)
            q = q.filter(AttendanceLog.user_id == uid)
        except ValueError:
            pass
    if start:
        try:
            q = q.filter(AttendanceLog.work_date >= date.fromisoformat(start[:10]))
        except ValueError:
            pass
    if end:
        try:
            q = q.filter(AttendanceLog.work_date <= date.fromisoformat(end[:10]))
        except ValueError:
            pass
    logs = q.order_by(AttendanceLog.work_date.desc(), AttendanceLog.check_in.desc()).limit(limit).all()

    # Enrich with user names
    user_ids = list({l.user_id for l in logs})
    users = {str(u.user_id): u.name for u in db.query(User).filter(User.user_id.in_(user_ids)).all()}

    result = []
    for l in logs:
        d = _to_dict(l)
        d["user_name"] = users.get(str(l.user_id)) or "Unknown"
        result.append(d)
    return result
