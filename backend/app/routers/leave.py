"""
Leave Management Router — RafikiHR
Handles leave policy, balances, applications, and HR approval workflow.
"""
import os
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from app.database import get_db
from app.dependencies import (
    get_current_user_id, get_current_org_id, get_current_role,
    require_admin, require_manager, get_current_user,
    require_can_act_for_employee,
)
from app.models.calendar_event import CalendarEvent
from app.routers.notifications import _insert_notification

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/leave", tags=["Leave"])

PRIVILEGED = {"hr_admin", "super_admin"}

TYPE_LABELS = {
    "annual": "Annual Leave",
    "sick": "Sick Leave",
    "maternity": "Maternity Leave",
    "paternity": "Paternity Leave",
}


# ══════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════

def _remove_leave_from_calendar(db: Session, org_id: uuid.UUID, app_id: str) -> None:
    """Remove all calendar events created from a leave application."""
    db.query(CalendarEvent).filter(
        CalendarEvent.org_id == org_id,
        CalendarEvent.source == "leave",
        CalendarEvent.external_id.startswith(f"leave_{app_id}_"),
    ).delete(synchronize_session=False)


def _sync_leave_to_calendar(
    db: Session,
    org_id: uuid.UUID,
    app_id: str,
    user_id: uuid.UUID,
    start_date: date,
    end_date: date,
    leave_type: str,
) -> None:
    """Create all-day calendar events for each day of approved leave (main calendar sync)."""
    _remove_leave_from_calendar(db, org_id, app_id)
    title_label = TYPE_LABELS.get(leave_type, f"{leave_type.title()} Leave")
    current = start_date
    while current <= end_date:
        start_dt = datetime(current.year, current.month, current.day, 0, 0, 0, tzinfo=timezone.utc)
        end_dt = datetime(current.year, current.month, current.day, 23, 59, 59, tzinfo=timezone.utc)
        ev = CalendarEvent(
            org_id=org_id,
            user_id=user_id,
            title=title_label,
            start_time=start_dt,
            end_time=end_dt,
            event_type="out-of-office",
            source="leave",
            external_id=f"leave_{app_id}_{current.isoformat()}",
        )
        db.add(ev)
        current += timedelta(days=1)


def _working_days(start: date, end: date) -> float:
    """Count working days (Mon–Fri) between two dates inclusive."""
    if end < start:
        return 0
    total = 0
    current = start
    while current <= end:
        if current.weekday() < 5:  # Mon=0 … Fri=4
            total += 1
        current += timedelta(days=1)
    return float(total)


def _get_policy(db: Session, org_id) -> Optional[dict]:
    row = db.execute(
        text("SELECT * FROM leave_policies WHERE org_id = :org ORDER BY created_at DESC LIMIT 1"),
        {"org": str(org_id)}
    ).mappings().first()
    return dict(row) if row else None


def _get_or_create_balance(db: Session, user_id, org_id, year: int, leave_type: str,
                            entitled: float = 0, policy=None) -> dict:
    row = db.execute(
        text("""SELECT * FROM leave_balances
                WHERE user_id = :uid AND leave_year = :yr AND leave_type = :lt"""),
        {"uid": str(user_id), "yr": year, "lt": leave_type}
    ).mappings().first()
    if row:
        existing = dict(row)
        # If a row exists with 0 entitled days but policy now provides a value,
        # update it so employees see correct balances (fixes "always zero" bug)
        if float(existing["entitled_days"]) == 0 and entitled > 0:
            db.execute(
                text("""UPDATE leave_balances SET entitled_days = :ent
                        WHERE user_id = :uid AND leave_year = :yr AND leave_type = :lt"""),
                {"ent": entitled, "uid": str(user_id), "yr": year, "lt": leave_type}
            )
            db.commit()
            existing["entitled_days"] = entitled
        return existing

    # Create fresh balance for this year
    carry = 0.0
    carry_expiry = None

    if year > date.today().year - 1 and policy:
        # Check if previous year had unused days to carry over
        prev = db.execute(
            text("""SELECT * FROM leave_balances
                    WHERE user_id = :uid AND leave_year = :yr AND leave_type = :lt"""),
            {"uid": str(user_id), "yr": year - 1, "lt": leave_type}
        ).mappings().first()
        if prev and policy.get("carry_over_policy") != "none":
            unused = float(prev["entitled_days"]) + float(prev["carried_over_days"]) - float(prev["used_days"])
            if unused > 0:
                if policy.get("carry_over_policy") == "capped":
                    carry = min(unused, float(policy.get("carry_over_days", 0)))
                else:
                    carry = unused
                months = int(policy.get("carry_over_expiry_months", 3))
                carry_expiry = date(year, 1, 1) + timedelta(days=months * 30)

    new_id = str(uuid.uuid4())
    db.execute(
        text("""INSERT INTO leave_balances
                (id, user_id, org_id, leave_year, leave_type, entitled_days, used_days, carried_over_days, carry_over_expiry)
                VALUES (:id, :uid, :org, :yr, :lt, :ent, 0, :carry, :expiry)"""),
        {"id": new_id, "uid": str(user_id), "org": str(org_id),
         "yr": year, "lt": leave_type, "ent": entitled,
         "carry": carry, "expiry": carry_expiry}
    )
    db.commit()
    row = db.execute(
        text("SELECT * FROM leave_balances WHERE id = :id"), {"id": new_id}
    ).mappings().first()
    return dict(row)


def _entitled_for_type(policy: dict, leave_type: str) -> float:
    mapping = {
        "annual": policy.get("annual_leave_days", 21),
        "sick": policy.get("sick_leave_days", 10),
        "maternity": policy.get("maternity_leave_days", 90),
        "paternity": policy.get("paternity_leave_days", 14),
    }
    if leave_type in mapping:
        return float(mapping[leave_type])
    # Check custom types
    for item in (policy.get("other_leave") or []):
        if isinstance(item, dict) and item.get("name", "").lower() == leave_type.lower():
            return float(item.get("days", 0))
    return 0.0


# ══════════════════════════════════════════════════════════════
# SCHEMAS
# ══════════════════════════════════════════════════════════════

class LeavePolicyIn(BaseModel):
    annual_leave_days: int = 21
    sick_leave_days: int = 10
    maternity_leave_days: int = 90
    paternity_leave_days: int = 14
    carry_over_days: int = 0
    carry_over_expiry_months: int = 3
    carry_over_policy: str = "none"   # 'none' | 'capped' | 'unlimited'
    other_leave: List[dict] = []
    kb_document_id: Optional[str] = None

    @field_validator("carry_over_policy")
    @classmethod
    def valid_policy(cls, v):
        if v not in ("none", "capped", "unlimited"):
            raise ValueError("carry_over_policy must be 'none', 'capped', or 'unlimited'")
        return v


class LeaveApplicationIn(BaseModel):
    leave_type: str
    start_date: date
    end_date: date
    reason: Optional[str] = None
    half_day: bool = False
    half_day_period: Optional[str] = None  # 'morning' | 'afternoon'


class LeaveApplyOnBehalfIn(BaseModel):
    """Manager/admin submits leave on behalf of an employee (non-digital access)."""
    employee_id: uuid.UUID
    leave_type: str
    start_date: date
    end_date: date
    reason: Optional[str] = None
    half_day: bool = False
    half_day_period: Optional[str] = None


class LeaveReviewIn(BaseModel):
    status: str          # 'approved' | 'rejected'
    comment: Optional[str] = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v not in ("approved", "rejected"):
            raise ValueError("status must be 'approved' or 'rejected'")
        return v


class LeaveAmendmentRequestIn(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    reason: Optional[str] = None
    cancel_leave: bool = False
    half_day: bool = False
    half_day_period: Optional[str] = None


class LeaveAmendmentReviewIn(BaseModel):
    decision: str  # approved | rejected
    comment: Optional[str] = None

    @field_validator("decision")
    @classmethod
    def valid_decision(cls, v):
        if v not in ("approved", "rejected"):
            raise ValueError("decision must be 'approved' or 'rejected'")
        return v


# ══════════════════════════════════════════════════════════════
# POLICY ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/policy")
def get_leave_policy(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    """Get current org leave policy (visible to all authenticated users)."""
    policy = _get_policy(db, org_id)
    if not policy:
        return {"message": "No leave policy configured yet.", "policy": None}
    return {"policy": policy}


@router.post("/policy")
def upsert_leave_policy(
    data: LeavePolicyIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(require_admin),
):
    """Create or update leave policy (HR admin only)."""
    import json
    existing = _get_policy(db, org_id)
    other_json = json.dumps(data.other_leave)

    if existing:
        db.execute(
            text("""UPDATE leave_policies SET
                    annual_leave_days=:ann, sick_leave_days=:sick,
                    maternity_leave_days=:mat, paternity_leave_days=:pat,
                    carry_over_days=:cod, carry_over_expiry_months=:coem,
                    carry_over_policy=:cop, other_leave=:ol,
                    kb_document_id=:kb, updated_at=now()
                    WHERE org_id=:org AND id=:id"""),
            {**data.model_dump(exclude={"other_leave"}),
             "ann": data.annual_leave_days, "sick": data.sick_leave_days,
             "mat": data.maternity_leave_days, "pat": data.paternity_leave_days,
             "cod": data.carry_over_days, "coem": data.carry_over_expiry_months,
             "cop": data.carry_over_policy, "ol": other_json,
             "kb": data.kb_document_id, "org": str(org_id), "id": str(existing["id"])}
        )
    else:
        db.execute(
            text("""INSERT INTO leave_policies
                    (id, org_id, annual_leave_days, sick_leave_days, maternity_leave_days,
                     paternity_leave_days, carry_over_days, carry_over_expiry_months,
                     carry_over_policy, other_leave, kb_document_id)
                    VALUES (:id, :org, :ann, :sick, :mat, :pat, :cod, :coem, :cop, :ol::jsonb, :kb)"""),
            {"id": str(uuid.uuid4()), "org": str(org_id),
             "ann": data.annual_leave_days, "sick": data.sick_leave_days,
             "mat": data.maternity_leave_days, "pat": data.paternity_leave_days,
             "cod": data.carry_over_days, "coem": data.carry_over_expiry_months,
             "cop": data.carry_over_policy, "ol": other_json,
             "kb": data.kb_document_id}
        )
    db.commit()
    return {"message": "Leave policy saved.", "policy": _get_policy(db, org_id)}


# ══════════════════════════════════════════════════════════════
# BALANCE ENDPOINTS
# ══════════════════════════════════════════════════════════════

DEFAULT_POLICY = {
    "annual_leave_days": 21,
    "sick_leave_days": 10,
    "maternity_leave_days": 90,
    "paternity_leave_days": 14,
    "carry_over_days": 0,
    "carry_over_expiry_months": 3,
    "carry_over_policy": "none",
    "other_leave": [],
}


def _get_user_gender(db: Session, user_id) -> Optional[str]:
    """Return the gender stored on employee_profiles, or None."""
    row = db.execute(
        text("SELECT gender FROM employee_profiles WHERE user_id = :uid LIMIT 1"),
        {"uid": str(user_id)}
    ).first()
    if row and row[0]:
        return str(row[0]).lower()
    return None


def _gender_leave_types(gender: Optional[str]) -> List[str]:
    """Return the base leave types appropriate for the user's gender.
    - male   → annual, sick, paternity
    - female → annual, sick, maternity
    - other/None → annual, sick, maternity, paternity (show all, let employee choose)
    """
    if gender == "male":
        return ["annual", "sick", "paternity"]
    if gender == "female":
        return ["annual", "sick", "maternity"]
    # unset or 'other' — show everything
    return ["annual", "sick", "maternity", "paternity"]


@router.get("/balance")
def get_my_balance(
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    """Get current user's leave balance for the given year (defaults to current year)."""
    yr = year or date.today().year
    policy = _get_policy(db, org_id) or DEFAULT_POLICY

    gender = _get_user_gender(db, user_id)
    leave_types = _gender_leave_types(gender)

    # Append any custom leave types from policy
    for item in (policy.get("other_leave") or []):
        if isinstance(item, dict) and item.get("name"):
            leave_types.append(item["name"].lower())

    balances = []
    for lt in leave_types:
        entitled = _entitled_for_type(policy, lt)
        bal = _get_or_create_balance(db, user_id, org_id, yr, lt, entitled, policy)
        available = float(bal["entitled_days"]) + float(bal["carried_over_days"]) - float(bal["used_days"])

        carry_expired = False
        if bal.get("carry_over_expiry") and date.today() > bal["carry_over_expiry"]:
            carry_expired = True
            available = float(bal["entitled_days"]) - float(bal["used_days"])

        balances.append({
            "leave_type": lt,
            "entitled_days": float(bal["entitled_days"]),
            "used_days": float(bal["used_days"]),
            "carried_over_days": float(bal["carried_over_days"]),
            "carry_over_expiry": str(bal["carry_over_expiry"]) if bal.get("carry_over_expiry") else None,
            "carry_over_expired": carry_expired,
            "available_days": max(0.0, available),
            "gender_context": gender,
        })

    return {
        "year": yr,
        "user_id": str(user_id),
        "gender": gender,
        "balances": balances,
        "policy": policy,
        "policy_is_default": _get_policy(db, org_id) is None,
    }


@router.get("/balance/{user_id_param}")
def get_user_balance(
    user_id_param: str,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(require_admin),
):
    """HR admin: get any employee's leave balance."""
    try:
        target_uid = uuid.UUID(user_id_param)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    yr = year or date.today().year
    policy = _get_policy(db, org_id) or DEFAULT_POLICY

    gender = _get_user_gender(db, target_uid)
    leave_types = _gender_leave_types(gender)
    for item in (policy.get("other_leave") or []):
        if isinstance(item, dict) and item.get("name"):
            leave_types.append(item["name"].lower())

    balances = []
    for lt in leave_types:
        entitled = _entitled_for_type(policy, lt)
        bal = _get_or_create_balance(db, target_uid, org_id, yr, lt, entitled, policy)
        available = float(bal["entitled_days"]) + float(bal["carried_over_days"]) - float(bal["used_days"])
        carry_expired = False
        if bal.get("carry_over_expiry") and date.today() > bal["carry_over_expiry"]:
            carry_expired = True
            available = float(bal["entitled_days"]) - float(bal["used_days"])
        balances.append({
            "leave_type": lt,
            "entitled_days": float(bal["entitled_days"]),
            "used_days": float(bal["used_days"]),
            "carried_over_days": float(bal["carried_over_days"]),
            "carry_over_expiry": str(bal["carry_over_expiry"]) if bal.get("carry_over_expiry") else None,
            "carry_over_expired": carry_expired,
            "available_days": max(0.0, available),
        })
    return {"year": yr, "user_id": user_id_param, "gender": gender, "balances": balances, "policy": policy}


# ══════════════════════════════════════════════════════════════
# APPLICATIONS — EMPLOYEE
# ══════════════════════════════════════════════════════════════

@router.post("/apply")
def apply_for_leave(
    data: LeaveApplicationIn,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    """Employee submits a leave application."""
    if data.end_date < data.start_date:
        raise HTTPException(status_code=400, detail="End date must be on or after start date")

    working = _working_days(data.start_date, data.end_date)
    if data.half_day:
        working = 0.5

    if working <= 0:
        raise HTTPException(status_code=400, detail="No working days in selected range")

    # Check balance
    policy = _get_policy(db, org_id) or DEFAULT_POLICY
    yr = data.start_date.year
    entitled = _entitled_for_type(policy, data.leave_type)
    bal = _get_or_create_balance(db, user_id, org_id, yr, data.leave_type, entitled, policy)
    available = float(bal["entitled_days"]) + float(bal["carried_over_days"]) - float(bal["used_days"])
    if bal.get("carry_over_expiry") and date.today() > bal["carry_over_expiry"]:
        available = float(bal["entitled_days"]) - float(bal["used_days"])

    if working > available:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient leave balance. You have {max(0, available):.1f} days available, but requested {working:.1f} days."
        )

    # Check for overlapping pending/approved applications
    overlap = db.execute(
        text("""SELECT id FROM leave_applications
                WHERE user_id = :uid AND status IN ('pending','approved')
                AND NOT (end_date < :start OR start_date > :end)"""),
        {"uid": str(user_id), "start": data.start_date, "end": data.end_date}
    ).first()
    if overlap:
        raise HTTPException(status_code=400, detail="You already have a leave application covering these dates")

    app_id = str(uuid.uuid4())
    db.execute(
        text("""INSERT INTO leave_applications
                (id, org_id, user_id, leave_type, start_date, end_date, working_days,
                 reason, half_day, half_day_period)
                VALUES (:id, :org, :uid, :lt, :sd, :ed, :wd, :reason, :hd, :hdp)"""),
        {"id": app_id, "org": str(org_id), "uid": str(user_id),
         "lt": data.leave_type, "sd": data.start_date, "ed": data.end_date,
         "wd": working, "reason": data.reason,
         "hd": data.half_day, "hdp": data.half_day_period}
    )
    db.commit()

    # ── Notify org HR admins that a new leave request needs approval ──
    try:
        from app.models.user import User as _User
        managers = db.query(_User.user_id).filter(
            _User.org_id == org_id,
            _User.role.in_(["hr_admin", "super_admin"]),
            _User.is_active == True,
        ).all()
        for (mgr_id,) in managers:
            _insert_notification(db, user_id=mgr_id, org_id=org_id,
                kind="leave_pending",
                title=f"Leave request: {data.leave_type} ({data.start_date} → {data.end_date})",
                body=f"{working:.0f} working day(s) · {data.reason or 'No reason given'}",
                link="/admin/leave")
        db.commit()
    except Exception as _e:
        logger.warning(f"Leave submit notification failed (non-fatal): {_e}")

    return {
        "message": "Leave application submitted successfully.",
        "application_id": app_id,
        "working_days": working,
        "status": "pending"
    }


@router.post("/apply-on-behalf")
def apply_for_leave_on_behalf(
    data: LeaveApplyOnBehalfIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user: Optional["User"] = Depends(get_current_user),
    _role: str = Depends(require_manager),
):
    """Manager or HR admin submits a leave application on behalf of an employee (proxy for non-digital staff)."""
    from app.models.user import User as _User
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    require_can_act_for_employee(db, current_user, data.employee_id)
    employee_id = data.employee_id

    if data.end_date < data.start_date:
        raise HTTPException(status_code=400, detail="End date must be on or after start date")

    working = _working_days(data.start_date, data.end_date)
    if data.half_day:
        working = 0.5

    if working <= 0:
        raise HTTPException(status_code=400, detail="No working days in selected range")

    policy = _get_policy(db, org_id) or DEFAULT_POLICY
    yr = data.start_date.year
    entitled = _entitled_for_type(policy, data.leave_type)
    bal = _get_or_create_balance(db, employee_id, org_id, yr, data.leave_type, entitled, policy)
    available = float(bal["entitled_days"]) + float(bal["carried_over_days"]) - float(bal["used_days"])
    if bal.get("carry_over_expiry") and date.today() > bal["carry_over_expiry"]:
        available = float(bal["entitled_days"]) - float(bal["used_days"])

    if working > available:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient leave balance. Employee has {max(0, available):.1f} days available, but requested {working:.1f} days."
        )

    overlap = db.execute(
        text("""SELECT id FROM leave_applications
                WHERE user_id = :uid AND status IN ('pending','approved')
                AND NOT (end_date < :start OR start_date > :end)"""),
        {"uid": str(employee_id), "start": data.start_date, "end": data.end_date}
    ).first()
    if overlap:
        raise HTTPException(status_code=400, detail="Employee already has a leave application covering these dates")

    app_id = str(uuid.uuid4())
    db.execute(
        text("""INSERT INTO leave_applications
                (id, org_id, user_id, leave_type, start_date, end_date, working_days,
                 reason, half_day, half_day_period)
                VALUES (:id, :org, :uid, :lt, :sd, :ed, :wd, :reason, :hd, :hdp)"""),
        {"id": app_id, "org": str(org_id), "uid": str(employee_id),
         "lt": data.leave_type, "sd": data.start_date, "ed": data.end_date,
         "wd": working, "reason": data.reason or "Submitted on behalf by manager/supervisor",
         "hd": data.half_day, "hdp": data.half_day_period}
    )
    db.commit()

    try:
        managers = db.query(_User.user_id).filter(
            _User.org_id == org_id,
            _User.role.in_(["hr_admin", "super_admin"]),
            _User.is_active == True,
        ).all()
        for (mgr_id,) in managers:
            _insert_notification(db, user_id=mgr_id, org_id=org_id,
                kind="leave_pending",
                title=f"Leave request (on behalf): {data.leave_type} ({data.start_date} → {data.end_date})",
                body=f"{working:.0f} working day(s) · Submitted by manager/supervisor",
                link="/admin/leave")
        db.commit()
    except Exception as _e:
        logger.warning(f"Leave on-behalf notification failed (non-fatal): %s", _e)

    return {
        "message": "Leave application submitted on behalf of employee.",
        "application_id": app_id,
        "working_days": working,
        "status": "pending",
    }


def _enrich_app_with_amendments(db: Session, app_dict: dict) -> dict:
    """Add effective_status and amendment_history for clear UI and audit trail."""
    app_id = str(app_dict.get("id"))
    pending = db.execute(
        text("""SELECT id FROM leave_amendment_requests
                WHERE leave_application_id = :app AND status = 'pending' LIMIT 1"""),
        {"app": app_id},
    ).first()
    history = db.execute(
        text("""SELECT id, status, requested_start_date, requested_end_date, requested_working_days,
                       cancel_leave, requested_reason, reviewed_by, reviewed_at, review_comment, created_at
                FROM leave_amendment_requests WHERE leave_application_id = :app ORDER BY created_at ASC"""),
        {"app": app_id},
    ).mappings().all()
    effective = app_dict.get("status")
    if effective == "approved" and pending:
        effective = "amendment_pending"
    elif effective == "cancelled" and history:
        effective = "cancelled"
    elif effective == "approved" and history and any(h.get("status") == "approved" for h in history):
        effective = "amended"
    out = dict(app_dict)
    out["effective_status"] = effective
    out["amendment_history"] = [dict(h) for h in history]
    return out


@router.get("/my-applications")
def get_my_applications(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Get all my leave applications with effective_status and amendment_history for audit trail."""
    q = "SELECT * FROM leave_applications WHERE user_id = :uid"
    params = {"uid": str(user_id)}
    if status:
        q += " AND status = :status"
        params["status"] = status
    q += " ORDER BY created_at DESC"
    rows = db.execute(text(q), params).mappings().all()
    applications = [_enrich_app_with_amendments(db, dict(r)) for r in rows]
    return {"applications": applications}


@router.delete("/cancel/{app_id}")
def cancel_application(
    app_id: str,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Employee cancels a pending leave application."""
    row = db.execute(
        text("SELECT * FROM leave_applications WHERE id = :id AND user_id = :uid"),
        {"id": app_id, "uid": str(user_id)}
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Application not found")
    if row["status"] != "pending":
        raise HTTPException(status_code=400, detail="Only pending applications can be cancelled")
    db.execute(
        text("UPDATE leave_applications SET status='cancelled', updated_at=now() WHERE id=:id"),
        {"id": app_id}
    )
    db.commit()
    return {"message": "Application cancelled"}


@router.post("/amendments/{app_id}")
def request_leave_amendment(
    app_id: str,
    data: LeaveAmendmentRequestIn,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Employee requests amendment/cancellation for an existing leave application."""
    row = db.execute(
        text("SELECT * FROM leave_applications WHERE id = :id AND user_id = :uid"),
        {"id": app_id, "uid": str(user_id)},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Application not found")
    if row["status"] not in ("pending", "approved"):
        raise HTTPException(status_code=400, detail="Only pending or approved applications can be amended")

    existing_pending = db.execute(
        text("""SELECT id FROM leave_amendment_requests
                WHERE leave_application_id = :app AND user_id = :uid AND status = 'pending'
                ORDER BY created_at DESC LIMIT 1"""),
        {"app": app_id, "uid": str(user_id)},
    ).first()
    if existing_pending:
        raise HTTPException(status_code=409, detail="There is already a pending amendment request for this leave")

    requested_start = row["start_date"] if data.start_date is None else data.start_date
    requested_end = row["end_date"] if data.end_date is None else data.end_date
    if data.cancel_leave:
        requested_days = 0.0
        requested_start = row["start_date"]
        requested_end = row["end_date"]
    else:
        if requested_end < requested_start:
            raise HTTPException(status_code=400, detail="End date must be on or after start date")
        requested_days = 0.5 if data.half_day else _working_days(requested_start, requested_end)
        if requested_days <= 0:
            raise HTTPException(status_code=400, detail="No working days in selected range")

    db.execute(
        text("""INSERT INTO leave_amendment_requests
                (id, leave_application_id, org_id, user_id, status,
                 requested_start_date, requested_end_date, requested_working_days,
                 requested_reason, cancel_leave, half_day, half_day_period)
                VALUES (:id, :app, :org, :uid, 'pending',
                        :rsd, :red, :rwd, :rr, :cancel, :half_day, :half_day_period)"""),
        {
            "id": str(uuid.uuid4()),
            "app": app_id,
            "org": str(row["org_id"]),
            "uid": str(user_id),
            "rsd": requested_start,
            "red": requested_end,
            "rwd": requested_days,
            "rr": data.reason,
            "cancel": data.cancel_leave,
            "half_day": data.half_day,
            "half_day_period": data.half_day_period if data.half_day else None,
        },
    )
    db.commit()

    # Notify employee's manager (re-approval step) and HR
    try:
        from app.models.user import User as _User
        emp_row = db.execute(
            text("SELECT manager_id FROM users_legacy WHERE user_id = :uid"),
            {"uid": str(user_id)},
        ).first()
        manager_id = emp_row[0] if emp_row and emp_row[0] else None
        hr_users = db.query(_User.user_id).filter(
            _User.org_id == org_id,
            _User.role.in_(["hr_admin", "super_admin"]),
            _User.is_active == True,
        ).all()
        notify_ids = set()
        if manager_id:
            notify_ids.add(manager_id)
        for (mgr_id,) in hr_users:
            notify_ids.add(mgr_id)
        amend_label = "Cancel leave" if data.cancel_leave else f"Change to {requested_start} → {requested_end} ({requested_days} days)"
        for uid in notify_ids:
            _insert_notification(
                db, user_id=uid, org_id=org_id,
                kind="leave_pending",
                title="Leave amendment requested",
                body=f"Employee requested: {amend_label}. Review in Leave.",
                link="/admin/leave" if uid in {m[0] for m in hr_users} else "/manager/on-behalf",
            )
        db.commit()
    except Exception as _e:
        logger.warning("Leave amendment notification failed (non-fatal): %s", _e)

    return {"message": "Amendment request submitted. Your manager and HR have been notified for re-approval."}


@router.get("/amendments/my")
def my_leave_amendments(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    rows = db.execute(
        text("""SELECT ar.*, la.leave_type, la.start_date AS current_start_date,
                       la.end_date AS current_end_date, la.working_days AS current_working_days
                FROM leave_amendment_requests ar
                JOIN leave_applications la ON la.id = ar.leave_application_id
                WHERE ar.user_id = :uid
                ORDER BY ar.created_at DESC"""),
        {"uid": str(user_id)},
    ).mappings().all()
    return {"amendments": [dict(r) for r in rows]}


@router.get("/manager/amendments")
def manager_pending_amendments(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    manager_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_manager),
):
    """Managers: list pending leave amendment requests for their direct reports."""
    rows = db.execute(
        text("""
            SELECT ar.*, la.leave_type, la.start_date AS current_start_date, la.end_date AS current_end_date,
                   la.working_days AS current_working_days, u.name AS employee_name, u.email AS employee_email
            FROM leave_amendment_requests ar
            JOIN leave_applications la ON la.id = ar.leave_application_id AND la.org_id = ar.org_id
            JOIN users_legacy u ON u.user_id = la.user_id AND u.manager_id = :mgr
            WHERE ar.org_id = :org AND ar.status = 'pending'
            ORDER BY ar.created_at DESC
        """),
        {"org": str(org_id), "mgr": str(manager_id)},
    ).mappings().all()
    return {"amendments": [dict(r) for r in rows]}


@router.post("/manager/amendments/{amendment_id}/review")
def manager_review_amendment(
    amendment_id: str,
    data: LeaveAmendmentReviewIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    reviewer_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_manager),
):
    """Managers: approve or reject a leave amendment for a direct report (same logic as HR review)."""
    amend = db.execute(
        text("""SELECT ar.*, la.user_id AS app_user_id, la.status AS app_status, la.leave_type, la.start_date, la.end_date, la.working_days
                FROM leave_amendment_requests ar
                JOIN leave_applications la ON la.id = ar.leave_application_id AND la.org_id = ar.org_id
                JOIN users_legacy u ON u.user_id = la.user_id AND u.manager_id = :mgr
                WHERE ar.id = :id AND ar.org_id = :org"""),
        {"id": amendment_id, "org": str(org_id), "mgr": str(reviewer_id)},
    ).mappings().first()
    if not amend:
        raise HTTPException(status_code=404, detail="Amendment not found or you are not the manager of this employee")
    if amend["status"] != "pending":
        raise HTTPException(status_code=400, detail="Amendment already reviewed")

    app = db.execute(
        text("SELECT * FROM leave_applications WHERE id = :id AND org_id = :org"),
        {"id": amend["leave_application_id"], "org": str(org_id)},
    ).mappings().first()
    if not app:
        raise HTTPException(status_code=404, detail="Leave application not found")

    if data.decision == "approved":
        if app["status"] == "approved":
            yr = app["start_date"].year
            policy = _get_policy(db, org_id) or DEFAULT_POLICY
            entitled = _entitled_for_type(policy, app["leave_type"])
            _get_or_create_balance(db, app["user_id"], org_id, yr, app["leave_type"], entitled, policy)
            if amend["cancel_leave"]:
                delta = -float(app["working_days"])
            else:
                delta = float(amend["requested_working_days"]) - float(app["working_days"])
            if delta != 0:
                db.execute(
                    text("""UPDATE leave_balances SET used_days = used_days + :delta
                            WHERE user_id = :uid AND leave_year = :yr AND leave_type = :lt"""),
                    {"delta": delta, "uid": str(app["user_id"]), "yr": yr, "lt": app["leave_type"]},
                )
        if amend["cancel_leave"]:
            db.execute(
                text("UPDATE leave_applications SET status='cancelled', updated_at=now() WHERE id=:id"),
                {"id": app["id"]},
            )
        else:
            db.execute(
                text("""UPDATE leave_applications SET start_date=:sd, end_date=:ed, working_days=:wd,
                        reason=:reason, half_day=:half_day, half_day_period=:half_day_period, updated_at=now() WHERE id=:id"""),
                {
                    "sd": amend["requested_start_date"], "ed": amend["requested_end_date"],
                    "wd": amend["requested_working_days"],
                    "reason": amend["requested_reason"] or app.get("reason"),
                    "half_day": amend["half_day"], "half_day_period": amend["half_day_period"],
                    "id": app["id"],
                },
            )
    db.execute(
        text("""UPDATE leave_amendment_requests SET status=:status, reviewed_by=:rb, reviewed_at=now(), review_comment=:comment, updated_at=now() WHERE id=:id"""),
        {"status": data.decision, "rb": str(reviewer_id), "comment": data.comment, "id": amendment_id},
    )
    db.commit()

    if data.decision == "approved":
        app_id_str = str(app["id"])
        if amend["cancel_leave"]:
            try:
                _remove_leave_from_calendar(db, org_id, app_id_str)
                db.commit()
            except Exception as _e:
                logger.warning("Leave calendar removal on manager amendment cancel: %s", _e)
                db.rollback()
        else:
            try:
                _sync_leave_to_calendar(db, org_id, app_id_str, app["user_id"], amend["requested_start_date"], amend["requested_end_date"], app["leave_type"])
                db.commit()
            except Exception as _e:
                logger.warning("Leave calendar re-sync on manager amendment: %s", _e)
                db.rollback()
        try:
            _insert_notification(db, user_id=app["user_id"], org_id=org_id, kind="leave_pending",
                title=f"Leave amendment {data.decision} by manager",
                body=data.comment or None, link="/leave")
            db.commit()
        except Exception:
            pass

    return {"message": f"Amendment {data.decision}."}


# ══════════════════════════════════════════════════════════════
# APPLICATIONS — HR ADMIN
# ══════════════════════════════════════════════════════════════

@router.get("/admin/applications")
def get_all_applications(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(require_admin),
):
    """HR admin: get all leave applications with effective_status and amendment_history."""
    q = """
        SELECT la.*, u.name AS full_name, u.email, u.department
        FROM leave_applications la
        LEFT JOIN users_legacy u ON u.user_id = la.user_id
        WHERE la.org_id = :org
    """
    params = {"org": str(org_id)}
    if status:
        q += " AND la.status = :status"
        params["status"] = status
    q += " ORDER BY la.created_at DESC"
    rows = db.execute(text(q), params).mappings().all()
    applications = [_enrich_app_with_amendments(db, dict(r)) for r in rows]
    return {"applications": applications}


@router.get("/admin/amendments")
def get_amendment_requests(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(require_admin),
):
    q = """
        SELECT ar.*, u.name AS full_name, u.email, u.department, la.leave_type
        FROM leave_amendment_requests ar
        JOIN leave_applications la ON la.id = ar.leave_application_id
        LEFT JOIN users_legacy u ON u.user_id = ar.user_id
        WHERE ar.org_id = :org
    """
    params = {"org": str(org_id)}
    if status:
        q += " AND ar.status = :status"
        params["status"] = status
    q += " ORDER BY ar.created_at DESC"
    rows = db.execute(text(q), params).mappings().all()
    return {"amendments": [dict(r) for r in rows]}


@router.post("/admin/amendments/{amendment_id}/review")
def review_amendment_request(
    amendment_id: str,
    data: LeaveAmendmentReviewIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    reviewer_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(require_admin),
):
    amend = db.execute(
        text("""SELECT * FROM leave_amendment_requests
                WHERE id = :id AND org_id = :org"""),
        {"id": amendment_id, "org": str(org_id)},
    ).mappings().first()
    if not amend:
        raise HTTPException(status_code=404, detail="Amendment request not found")
    if amend["status"] != "pending":
        raise HTTPException(status_code=400, detail="Amendment request is already reviewed")

    app = db.execute(
        text("SELECT * FROM leave_applications WHERE id = :id AND org_id = :org"),
        {"id": amend["leave_application_id"], "org": str(org_id)},
    ).mappings().first()
    if not app:
        raise HTTPException(status_code=404, detail="Related leave application not found")

    if data.decision == "approved":
        # Keep leave balance accurate when approved leave duration is changed/cancelled.
        if app["status"] == "approved":
            yr = app["start_date"].year
            policy = _get_policy(db, org_id) or DEFAULT_POLICY
            entitled = _entitled_for_type(policy, app["leave_type"])
            _get_or_create_balance(db, app["user_id"], org_id, yr, app["leave_type"], entitled, policy)

            if amend["cancel_leave"]:
                delta = -float(app["working_days"])
            else:
                delta = float(amend["requested_working_days"]) - float(app["working_days"])

            if delta != 0:
                db.execute(
                    text("""UPDATE leave_balances SET used_days = used_days + :delta
                            WHERE user_id = :uid AND leave_year = :yr AND leave_type = :lt"""),
                    {"delta": delta, "uid": str(app["user_id"]), "yr": yr, "lt": app["leave_type"]},
                )

        if amend["cancel_leave"]:
            db.execute(
                text("""UPDATE leave_applications
                        SET status='cancelled', updated_at=now()
                        WHERE id=:id"""),
                {"id": app["id"]},
            )
        else:
            db.execute(
                text("""UPDATE leave_applications SET
                        start_date=:sd, end_date=:ed, working_days=:wd,
                        reason=:reason, half_day=:half_day, half_day_period=:half_day_period,
                        updated_at=now()
                        WHERE id=:id"""),
                {
                    "sd": amend["requested_start_date"],
                    "ed": amend["requested_end_date"],
                    "wd": amend["requested_working_days"],
                    "reason": amend["requested_reason"] or app.get("reason"),
                    "half_day": amend["half_day"],
                    "half_day_period": amend["half_day_period"],
                    "id": app["id"],
                },
            )

    db.execute(
        text("""UPDATE leave_amendment_requests SET
                status=:status, reviewed_by=:rb, reviewed_at=now(), review_comment=:comment, updated_at=now()
                WHERE id=:id"""),
        {
            "status": data.decision,
            "rb": str(reviewer_id),
            "comment": data.comment,
            "id": amendment_id,
        },
    )
    db.commit()

    # Keep main calendar in sync: remove leave events when cancelled; re-sync when dates change
    if data.decision == "approved":
        app_id_str = str(app["id"])
        if amend["cancel_leave"]:
            try:
                _remove_leave_from_calendar(db, org_id, app_id_str)
                db.commit()
            except Exception as _e:
                logger.warning("Leave calendar removal on cancel failed (non-fatal): %s", _e)
                db.rollback()
        else:
            try:
                _sync_leave_to_calendar(
                    db, org_id, app_id_str,
                    app["user_id"],
                    amend["requested_start_date"],
                    amend["requested_end_date"],
                    app["leave_type"],
                )
                db.commit()
            except Exception as _e:
                logger.warning("Leave calendar re-sync on amendment failed (non-fatal): %s", _e)
                db.rollback()

    return {"message": f"Amendment {data.decision}."}


@router.get("/admin/summary")
def get_leave_summary(
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(require_admin),
):
    """HR admin: org-wide leave summary for the year."""
    yr = year or date.today().year
    stats = db.execute(
        text("""SELECT status, COUNT(*) as count, SUM(working_days) as total_days
                FROM leave_applications
                WHERE org_id = :org AND EXTRACT(YEAR FROM start_date) = :yr
                GROUP BY status"""),
        {"org": str(org_id), "yr": yr}
    ).mappings().all()

    by_type = db.execute(
        text("""SELECT leave_type, COUNT(*) as count, SUM(working_days) as total_days
                FROM leave_applications
                WHERE org_id = :org AND EXTRACT(YEAR FROM start_date) = :yr
                AND status = 'approved'
                GROUP BY leave_type"""),
        {"org": str(org_id), "yr": yr}
    ).mappings().all()

    pending_count = db.execute(
        text("SELECT COUNT(*) FROM leave_applications WHERE org_id=:org AND status='pending'"),
        {"org": str(org_id)}
    ).scalar()

    return {
        "year": yr,
        "pending_requiring_action": pending_count,
        "by_status": [dict(r) for r in stats],
        "approved_by_type": [dict(r) for r in by_type],
    }


@router.post("/admin/review/{app_id}")
def review_application(
    app_id: str,
    data: LeaveReviewIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    reviewer_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(require_admin),
):
    """HR admin: approve or reject a leave application."""
    row = db.execute(
        text("SELECT * FROM leave_applications WHERE id = :id AND org_id = :org"),
        {"id": app_id, "org": str(org_id)}
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Application not found")
    if row["status"] != "pending":
        raise HTTPException(status_code=400, detail="Application is not pending")

    db.execute(
        text("""UPDATE leave_applications SET
                status = :status, reviewed_by = :rb, reviewed_at = now(),
                review_comment = :comment, updated_at = now()
                WHERE id = :id"""),
        {"status": data.status, "rb": str(reviewer_id),
         "comment": data.comment, "id": app_id}
    )

    # If approved, deduct from balance
    if data.status == "approved":
        yr = row["start_date"].year
        policy = _get_policy(db, org_id)
        entitled = _entitled_for_type(policy, row["leave_type"]) if policy else 0.0
        _get_or_create_balance(db, row["user_id"], org_id, yr, row["leave_type"], entitled, policy)
        db.execute(
            text("""UPDATE leave_balances SET
                    used_days = used_days + :days WHERE user_id = :uid AND leave_year = :yr AND leave_type = :lt"""),
            {"days": float(row["working_days"]), "uid": str(row["user_id"]),
             "yr": yr, "lt": row["leave_type"]}
        )

    db.commit()

    # ── Sprint 1: Auto-create timesheet entries for approved leave ──────────
    if data.status == "approved":
        try:
            from app.models.timesheet import TimesheetEntry as _TS
            leave_start: date = row["start_date"]
            leave_end:   date = row["end_date"]
            leave_type_str: str = row["leave_type"]
            emp_user_id = row["user_id"]

            hours_per_day = 4.0 if row.get("half_day") else 8.0
            type_labels = {
                "annual":    "Annual Leave",
                "sick":      "Sick Leave",
                "maternity": "Maternity Leave",
                "paternity": "Paternity Leave",
            }
            project_label = type_labels.get(leave_type_str, f"{leave_type_str.title()} Leave")

            current = leave_start
            created = 0
            while current <= leave_end:
                if current.weekday() < 5:
                    existing = db.query(_TS).filter(
                        _TS.org_id   == org_id,
                        _TS.user_id  == emp_user_id,
                        _TS.date     == current,
                        _TS.is_leave == True,
                    ).first()
                    if not existing:
                        ts = _TS(
                            org_id               = org_id,
                            user_id              = emp_user_id,
                            date                 = current,
                            project              = project_label,
                            activity_type        = "organisational",
                            category             = "Admin",
                            hours                = hours_per_day,
                            description          = f"Auto-generated from approved {leave_type_str} leave.",
                            status               = "approved",
                            submitted_at         = datetime.utcnow(),
                            approved_by          = reviewer_id,
                            approved_at          = datetime.utcnow(),
                            approval_comment     = "Auto-approved via leave management.",
                            is_leave             = True,
                            leave_application_id = uuid.UUID(app_id),
                        )
                        db.add(ts)
                        created += 1
                current += timedelta(days=1)

            if created:
                db.commit()
                logger.info(f"Leave sync: created {created} timesheet entries for user {emp_user_id}")

        except Exception as _sync_err:
            logger.warning(f"Leave->timesheet sync failed (non-fatal): {_sync_err}")
            db.rollback()

        # ── Sync approved leave to main calendar ────────────────────────────
        try:
            _sync_leave_to_calendar(
                db, org_id, app_id,
                row["user_id"], row["start_date"], row["end_date"], row["leave_type"],
            )
            db.commit()
            logger.info(f"Leave calendar sync: added events for user {row['user_id']} ({row['start_date']} → {row['end_date']})")
        except Exception as _cal_err:
            logger.warning(f"Leave->calendar sync failed (non-fatal): {_cal_err}")
            db.rollback()
    # ── end Sprint 1 leave sync ─────────────────────────────────────────────

    # Send notification via sidebar message if possible
    try:
        from app.models.chat_session import ChatMessage
        status_label = "✅ Approved" if data.status == "approved" else "❌ Rejected"
        msg = (f"{status_label}: Your {row['leave_type']} leave application "
               f"({row['start_date']} → {row['end_date']}, {row['working_days']} days) "
               f"has been {data.status}.")
        if data.comment:
            msg += f" Note: {data.comment}"
        db.add(ChatMessage(session_id=None, role="system",
                           content=msg, user_id=row["user_id"]))
        db.commit()
    except Exception:
        pass

    # ── Sprint 5: In-app notification to employee ────────────────────
    try:
        status_label = "approved ✅" if data.status == "approved" else "rejected ❌"
        _insert_notification(db, user_id=row["user_id"], org_id=org_id,
            kind="leave_pending",
            title=f"Leave {status_label}: {row['leave_type']} ({row['start_date']} → {row['end_date']})",
            body=data.comment or None,
            link="/leave")
        db.commit()
    except Exception as _e:
        logger.warning(f"Leave review notification failed (non-fatal): {_e}")
    # ── end Sprint 5 ─────────────────────────────────────────────────

    return {"message": f"Application {data.status}.", "application_id": app_id}


@router.post("/admin/adjust-balance")
def adjust_balance(
    user_id_param: str,
    leave_type: str,
    year: int,
    adjustment: float,
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(require_admin),
):
    """HR admin: manually adjust an employee's leave balance (positive = add, negative = deduct)."""
    try:
        target_uid = uuid.UUID(user_id_param)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    policy = _get_policy(db, org_id)
    entitled = _entitled_for_type(policy, leave_type) if policy else 0.0
    _get_or_create_balance(db, target_uid, org_id, year, leave_type, entitled, policy)

    if adjustment > 0:
        db.execute(
            text("""UPDATE leave_balances SET entitled_days = entitled_days + :adj
                    WHERE user_id=:uid AND leave_year=:yr AND leave_type=:lt"""),
            {"adj": adjustment, "uid": str(target_uid), "yr": year, "lt": leave_type}
        )
    else:
        db.execute(
            text("""UPDATE leave_balances SET used_days = used_days + :adj
                    WHERE user_id=:uid AND leave_year=:yr AND leave_type=:lt"""),
            {"adj": abs(adjustment), "uid": str(target_uid), "yr": year, "lt": leave_type}
        )
    db.commit()
    return {"message": f"Balance adjusted by {adjustment} days for {leave_type}."}
