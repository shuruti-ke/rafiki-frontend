"""
Leave Management Router — RafikiHR
Handles leave policy, balances, applications, and HR approval workflow.
"""
import os
import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from app.database import get_db
from app.dependencies import (
    get_current_user_id, get_current_org_id, get_current_role,
    require_admin, get_current_user
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/leave", tags=["Leave"])

PRIVILEGED = {"hr_admin", "super_admin"}


# ══════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════

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


class LeaveReviewIn(BaseModel):
    status: str          # 'approved' | 'rejected'
    comment: Optional[str] = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v not in ("approved", "rejected"):
            raise ValueError("status must be 'approved' or 'rejected'")
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

    return {
        "message": "Leave application submitted successfully.",
        "application_id": app_id,
        "working_days": working,
        "status": "pending"
    }


@router.get("/my-applications")
def get_my_applications(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Get all my leave applications."""
    q = "SELECT * FROM leave_applications WHERE user_id = :uid"
    params = {"uid": str(user_id)}
    if status:
        q += " AND status = :status"
        params["status"] = status
    q += " ORDER BY created_at DESC"
    rows = db.execute(text(q), params).mappings().all()
    return {"applications": [dict(r) for r in rows]}


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
    """HR admin: get all leave applications for the org with employee info."""
    q = """
        SELECT la.*, u.full_name, u.email, u.department
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
    return {"applications": [dict(r) for r in rows]}


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
                    used_days = used_days + :days, updated_at = now()
                    WHERE user_id = :uid AND leave_year = :yr AND leave_type = :lt"""),
            {"days": float(row["working_days"]), "uid": str(row["user_id"]),
             "yr": yr, "lt": row["leave_type"]}
        )

    db.commit()

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
