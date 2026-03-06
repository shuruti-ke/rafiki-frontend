"""Timesheets router — Sprint 1 update."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func, text
from datetime import date, datetime, timedelta
from typing import Optional
from decimal import Decimal

from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id, get_current_role, require_manager
from app.models.timesheet import TimesheetEntry
from app.models.user import User
from app.schemas.timesheet import (
    TimesheetEntryCreate,
    TimesheetEntryUpdate,
    TimesheetEntryResponse,
    TimesheetSubmit,
    TimesheetApproval,
)

router = APIRouter(prefix="/api/v1/timesheets", tags=["Timesheets"])


# ── CRUD ──────────────────────────────────────────────────────────────────────


@router.post("/", response_model=TimesheetEntryResponse)
def create_entry(
    body: TimesheetEntryCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    entry = TimesheetEntry(
        org_id=org_id,
        user_id=user_id,
        date=body.date,
        project=body.project,
        activity_type=getattr(body, "activity_type", "project"),
        category=body.category,
        hours=body.hours,
        description=body.description,
        objective_id=body.objective_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/", response_model=list[TimesheetEntryResponse])
def list_entries(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    status: Optional[str] = Query(None),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    q = db.query(TimesheetEntry).filter(
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.user_id == user_id,
    )
    if start:
        q = q.filter(TimesheetEntry.date >= start)
    if end:
        q = q.filter(TimesheetEntry.date <= end)
    if status:
        q = q.filter(TimesheetEntry.status == status)
    return q.order_by(TimesheetEntry.date.desc()).all()


# ── Submit / Approve (bulk) ────────────────────────────────────────────────────


@router.post("/submit")
def submit_entries(
    body: TimesheetSubmit,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    entries = db.query(TimesheetEntry).filter(
        TimesheetEntry.id.in_(body.entry_ids),
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.user_id == user_id,
        TimesheetEntry.status == "draft",
    ).all()
    now = datetime.utcnow()
    for e in entries:
        e.status = "submitted"
        e.submitted_at = now
    db.commit()
    return {"ok": True, "submitted": len(entries)}


@router.post("/approve")
def approve_entries(
    body: TimesheetApproval,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(require_manager),
    db: Session = Depends(get_db),
):
    entries = db.query(TimesheetEntry).filter(
        TimesheetEntry.id.in_(body.entry_ids),
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.status == "submitted",
    ).all()
    now = datetime.utcnow()
    new_status = "approved" if body.action == "approve" else "rejected"
    for e in entries:
        e.status = new_status
        e.approved_by = user_id
        e.approved_at = now
        e.approval_comment = body.comment
    db.commit()
    return {"ok": True, "action": body.action, "count": len(entries)}


# ── Admin: org-wide report ─────────────────────────────────────────────────────


@router.get("/admin/all")
def admin_all_entries(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    status: Optional[str] = Query(None),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """Return all timesheet entries for the org with employee name + department attached."""
    q = (
        db.query(TimesheetEntry, User)
        .join(User, User.user_id == TimesheetEntry.user_id)
        .filter(TimesheetEntry.org_id == org_id)
    )
    if start:
        q = q.filter(TimesheetEntry.date >= start)
    if end:
        q = q.filter(TimesheetEntry.date <= end)
    if status:
        q = q.filter(TimesheetEntry.status == status)

    rows = q.order_by(TimesheetEntry.date.desc()).limit(1000).all()
    return [
        {
            "id":                  str(entry.id),
            "user_id":             str(entry.user_id),
            "employee_name":       user.name or user.email,
            "department":          getattr(user, "department", None),
            "date":                str(entry.date),
            "project":             entry.project,
            "activity_type":       entry.activity_type,
            "category":            entry.category,
            "hours":               float(entry.hours),
            "status":              entry.status,
            "description":         entry.description or "",
            "is_leave":            entry.is_leave,
            "submitted_at":        entry.submitted_at.isoformat() if entry.submitted_at else None,
            "approved_at":         entry.approved_at.isoformat()  if entry.approved_at  else None,
            "approval_comment":    entry.approval_comment,
        }
        for entry, user in rows
    ]


# ── Sprint 1: Anomaly detection ────────────────────────────────────────────────


@router.get("/admin/anomalies")
def get_anomalies(
    week_start: date = Query(..., description="Monday of the week to analyse"),
    threshold_pct: float = Query(default=40.0, description="Flag if hours are this % below rolling average"),
    min_hours: float = Query(default=20.0, description="Also flag if total weekly hours fall below this absolute value"),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """
    Compare each employee's current week hours against their 8-week rolling average.
    Returns a list of flagged entries with reasons.
    """
    week_end = week_start + timedelta(days=6)

    # 8-week rolling window (excluding current week)
    rolling_start = week_start - timedelta(weeks=8)
    rolling_end   = week_start - timedelta(days=1)

    # Current week totals per employee
    current_rows = db.execute(
        text("""
            SELECT user_id, SUM(hours) AS total_hours
            FROM timesheet_entries
            WHERE org_id = :org
              AND date >= :ws AND date <= :we
              AND is_leave = FALSE
            GROUP BY user_id
        """),
        {"org": str(org_id), "ws": week_start, "we": week_end},
    ).mappings().all()

    current_map = {str(r["user_id"]): float(r["total_hours"]) for r in current_rows}

    # Rolling 8-week average per employee
    rolling_rows = db.execute(
        text("""
            SELECT user_id,
                   SUM(hours) / 8.0 AS weekly_avg,
                   COUNT(DISTINCT DATE_TRUNC('week', date)) AS weeks_with_data
            FROM timesheet_entries
            WHERE org_id = :org
              AND date >= :rs AND date <= :re
              AND is_leave = FALSE
            GROUP BY user_id
        """),
        {"org": str(org_id), "rs": rolling_start, "re": rolling_end},
    ).mappings().all()

    rolling_map = {
        str(r["user_id"]): {
            "avg": float(r["weekly_avg"]),
            "weeks": int(r["weeks_with_data"]),
        }
        for r in rolling_rows
    }

    # Fetch employee names for all users with entries this week
    all_user_ids = list(current_map.keys())
    if not all_user_ids:
        return {"week_start": str(week_start), "anomalies": [], "clean": []}

    user_rows = db.execute(
        text("""
            SELECT user_id, name, email, department
            FROM users_legacy
            WHERE user_id = ANY(:ids) AND org_id = :org
        """),
        {"ids": [uuid.UUID(uid) for uid in all_user_ids], "org": str(org_id)},
    ).mappings().all()

    user_map = {str(r["user_id"]): r for r in user_rows}

    anomalies = []
    clean     = []

    for uid, hours in current_map.items():
        user      = user_map.get(uid, {})
        roll      = rolling_map.get(uid)
        flags     = []

        if hours < min_hours:
            flags.append({
                "type":    "below_minimum",
                "message": f"Only {hours}h logged — below the {min_hours}h minimum threshold",
                "severity": "high" if hours == 0 else "medium",
            })

        if roll and roll["weeks"] >= 2:
            avg = roll["avg"]
            if avg > 0:
                drop_pct = ((avg - hours) / avg) * 100
                if drop_pct >= threshold_pct:
                    flags.append({
                        "type":    "below_rolling_average",
                        "message": f"{drop_pct:.0f}% below their {roll['weeks']}-week average ({avg:.1f}h avg vs {hours}h this week)",
                        "severity": "high" if drop_pct >= 60 else "medium",
                    })

        result = {
            "user_id":        uid,
            "employee_name":  user.get("name") or user.get("email") or uid,
            "department":     user.get("department"),
            "hours_this_week": hours,
            "rolling_avg":    rolling_map.get(uid, {}).get("avg"),
            "flags":          flags,
        }

        if flags:
            anomalies.append(result)
        else:
            clean.append(result)

    # Sort anomalies — high severity first
    severity_order = {"high": 0, "medium": 1}
    anomalies.sort(key=lambda x: min((severity_order.get(f["severity"], 2) for f in x["flags"]), default=2))

    return {
        "week_start":    str(week_start),
        "anomaly_count": len(anomalies),
        "clean_count":   len(clean),
        "threshold_pct": threshold_pct,
        "min_hours":     min_hours,
        "anomalies":     anomalies,
        "clean":         clean,
    }


# ── Sprint 1: Escalation check ────────────────────────────────────────────────


@router.get("/admin/overdue-approvals")
def overdue_approvals(
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """
    Returns submitted timesheet entries that have been waiting longer than
    the manager's configured escalation threshold (default 3 days).
    Identifies whether to escalate to deputy or HR admin.
    """
    rows = db.execute(
        text("""
            SELECT
                te.id,
                te.user_id,
                te.date,
                te.project,
                te.hours,
                te.submitted_at,
                te.status,
                ue.name            AS employee_name,
                ue.department,
                um.user_id         AS manager_id,
                um.name            AS manager_name,
                um.deputy_manager_id,
                um.approval_escalation_days,
                ud.name            AS deputy_name
            FROM timesheet_entries te
            JOIN users_legacy ue ON ue.user_id = te.user_id
            LEFT JOIN users_legacy um ON um.user_id = ue.manager_id
            LEFT JOIN users_legacy ud ON ud.user_id = um.deputy_manager_id
            WHERE te.org_id = :org
              AND te.status = 'submitted'
              AND te.submitted_at IS NOT NULL
        """),
        {"org": str(org_id)},
    ).mappings().all()

    now = datetime.utcnow()
    overdue = []

    for r in rows:
        submitted_at = r["submitted_at"]
        if submitted_at is None:
            continue
        days_waiting = (now - submitted_at.replace(tzinfo=None)).days
        threshold    = int(r["approval_escalation_days"] or 3)

        if days_waiting >= threshold:
            overdue.append({
                "entry_id":              str(r["id"]),
                "user_id":               str(r["user_id"]),
                "employee_name":         r["employee_name"],
                "department":            r["department"],
                "date":                  str(r["date"]),
                "project":               r["project"],
                "hours":                 float(r["hours"]),
                "submitted_at":          r["submitted_at"].isoformat(),
                "days_waiting":          days_waiting,
                "escalation_threshold":  threshold,
                "manager_id":            str(r["manager_id"]) if r["manager_id"] else None,
                "manager_name":          r["manager_name"],
                "deputy_manager_id":     str(r["deputy_manager_id"]) if r["deputy_manager_id"] else None,
                "deputy_name":           r["deputy_name"],
                "escalate_to":           "deputy" if r["deputy_manager_id"] else "hr_admin",
            })

    overdue.sort(key=lambda x: x["days_waiting"], reverse=True)
    return {"overdue_count": len(overdue), "entries": overdue}


# ── Sprint 1: Deputy manager assignment ───────────────────────────────────────


@router.post("/deputy")
def set_deputy(
    deputy_id: Optional[uuid.UUID] = Query(default=None, description="UUID of deputy manager, or null to clear"),
    escalation_days: int = Query(default=3, ge=1, le=30),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """Set or clear your deputy manager and approval escalation threshold."""
    if deputy_id and deputy_id == user_id:
        raise HTTPException(400, "You cannot set yourself as your own deputy")

    if deputy_id:
        # Verify deputy exists in same org
        deputy = db.execute(
            text("SELECT user_id FROM users_legacy WHERE user_id = :uid AND org_id = :org"),
            {"uid": str(deputy_id), "org": str(org_id)},
        ).mappings().first()
        if not deputy:
            raise HTTPException(404, "Deputy not found in your organisation")

    db.execute(
        text("""
            UPDATE users_legacy
            SET deputy_manager_id = :deputy,
                approval_escalation_days = :days
            WHERE user_id = :uid
        """),
        {"deputy": str(deputy_id) if deputy_id else None, "days": escalation_days, "uid": str(user_id)},
    )
    db.commit()
    return {
        "ok": True,
        "deputy_manager_id":     str(deputy_id) if deputy_id else None,
        "approval_escalation_days": escalation_days,
    }


@router.get("/deputy")
def get_deputy(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get current deputy manager setting for the logged-in manager."""
    row = db.execute(
        text("""
            SELECT u.deputy_manager_id, u.approval_escalation_days,
                   d.name AS deputy_name, d.email AS deputy_email
            FROM users_legacy u
            LEFT JOIN users_legacy d ON d.user_id = u.deputy_manager_id
            WHERE u.user_id = :uid
        """),
        {"uid": str(user_id)},
    ).mappings().first()

    if not row:
        raise HTTPException(404, "User not found")

    return {
        "deputy_manager_id":        str(row["deputy_manager_id"]) if row["deputy_manager_id"] else None,
        "deputy_name":              row["deputy_name"],
        "deputy_email":             row["deputy_email"],
        "approval_escalation_days": row["approval_escalation_days"],
    }


# ── Per-entry approve / reject ─────────────────────────────────────────────────


@router.post("/{entry_id}/approve")
def approve_single(
    entry_id: uuid.UUID,
    org_id: uuid.UUID = Depends(get_current_org_id),
    approver_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(require_manager),
    db: Session = Depends(get_db),
):
    entry = db.query(TimesheetEntry).filter(
        TimesheetEntry.id == entry_id,
        TimesheetEntry.org_id == org_id,
    ).first()
    if not entry:
        raise HTTPException(404, "Entry not found")
    if entry.status != "submitted":
        raise HTTPException(400, f"Entry status is '{entry.status}', expected 'submitted'")
    entry.status = "approved"
    entry.approved_by = approver_id
    entry.approved_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "id": str(entry_id), "status": "approved"}


@router.post("/{entry_id}/reject")
def reject_single(
    entry_id: uuid.UUID,
    org_id: uuid.UUID = Depends(get_current_org_id),
    approver_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(require_manager),
    db: Session = Depends(get_db),
):
    entry = db.query(TimesheetEntry).filter(
        TimesheetEntry.id == entry_id,
        TimesheetEntry.org_id == org_id,
    ).first()
    if not entry:
        raise HTTPException(404, "Entry not found")
    if entry.status != "submitted":
        raise HTTPException(400, f"Entry status is '{entry.status}', expected 'submitted'")
    entry.status = "rejected"
    entry.approved_by = approver_id
    entry.approved_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "id": str(entry_id), "status": "rejected"}


# ── Team entries (manager view) ────────────────────────────────────────────────


@router.get("/team", response_model=list[TimesheetEntryResponse])
def team_entries(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    status: Optional[str] = Query(None),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(require_manager),
    db: Session = Depends(get_db),
):
    q = db.query(TimesheetEntry).filter(TimesheetEntry.org_id == org_id)
    if start:
        q = q.filter(TimesheetEntry.date >= start)
    if end:
        q = q.filter(TimesheetEntry.date <= end)
    if status:
        q = q.filter(TimesheetEntry.status == status)
    return q.order_by(TimesheetEntry.date.desc()).limit(500).all()


# ── Summaries ──────────────────────────────────────────────────────────────────


@router.get("/summary/daily")
def daily_summary(
    d: date = Query(...),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    entries = db.query(TimesheetEntry).filter(
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.user_id == user_id,
        TimesheetEntry.date == d,
    ).all()
    total = sum(float(e.hours) for e in entries)
    return {"date": str(d), "total_hours": total, "entries": len(entries)}


@router.get("/summary/weekly")
def weekly_summary(
    week_start: date = Query(...),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    week_end = week_start + timedelta(days=6)
    entries = db.query(TimesheetEntry).filter(
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.user_id == user_id,
        TimesheetEntry.date >= week_start,
        TimesheetEntry.date <= week_end,
    ).all()
    total  = sum(float(e.hours) for e in entries)
    by_day = {}
    for e in entries:
        ds = str(e.date)
        by_day[ds] = by_day.get(ds, 0) + float(e.hours)
    return {"week_start": str(week_start), "total_hours": total, "by_day": by_day, "entries": len(entries)}


@router.get("/summary/monthly")
def monthly_summary(
    year: int = Query(...),
    month: int = Query(...),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    from datetime import date as _date
    start = _date(year, month, 1)
    end   = _date(year, month + 1, 1) - timedelta(days=1) if month < 12 else _date(year + 1, 1, 1) - timedelta(days=1)

    entries = db.query(TimesheetEntry).filter(
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.user_id == user_id,
        TimesheetEntry.date >= start,
        TimesheetEntry.date <= end,
    ).all()
    total      = sum(float(e.hours) for e in entries)
    by_project = {}
    for e in entries:
        by_project[e.project] = by_project.get(e.project, 0) + float(e.hours)
    return {"year": year, "month": month, "total_hours": total, "by_project": by_project, "entries": len(entries)}


# ── AI feed ────────────────────────────────────────────────────────────────────


@router.get("/ai-feed")
def ai_feed(
    days: int = Query(default=7, ge=1, le=90),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    from datetime import date as _date
    start   = _date.today() - timedelta(days=days)
    entries = db.query(TimesheetEntry).filter(
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.user_id == user_id,
        TimesheetEntry.date >= start,
    ).order_by(TimesheetEntry.date).all()

    total       = sum(float(e.hours) for e in entries)
    by_project  = {}
    by_category = {}
    for e in entries:
        by_project[e.project]   = by_project.get(e.project, 0)   + float(e.hours)
        by_category[e.category] = by_category.get(e.category, 0) + float(e.hours)

    return {
        "period_days":   days,
        "total_hours":   total,
        "avg_daily":     round(total / max(days, 1), 1),
        "by_project":    by_project,
        "by_category":   by_category,
        "entry_count":   len(entries),
    }


# ── Categories / Projects ──────────────────────────────────────────────────────


@router.get("/categories")
def list_categories():
    return ["Development", "Meetings", "Code Review", "Documentation", "Testing",
            "Design", "Research", "Admin", "Training", "Support", "Other"]


@router.get("/projects")
def list_projects(
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    rows = db.query(TimesheetEntry.project).filter(
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.activity_type == "project",   # only real projects, not org activities
    ).distinct().all()
    return sorted(set(r[0] for r in rows))


# ── Single-entry CRUD (must stay AFTER all fixed paths) ───────────────────────


@router.get("/{entry_id}", response_model=TimesheetEntryResponse)
def get_entry(
    entry_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    entry = db.query(TimesheetEntry).filter(
        TimesheetEntry.id == entry_id,
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.user_id == user_id,
    ).first()
    if not entry:
        raise HTTPException(404, "Entry not found")
    return entry


@router.put("/{entry_id}", response_model=TimesheetEntryResponse)
def update_entry(
    entry_id: uuid.UUID,
    body: TimesheetEntryUpdate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    entry = db.query(TimesheetEntry).filter(
        TimesheetEntry.id == entry_id,
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.user_id == user_id,
    ).first()
    if not entry:
        raise HTTPException(404, "Entry not found")
    if entry.status not in ("draft", "rejected"):
        raise HTTPException(400, "Can only edit draft or rejected entries")
    if entry.is_leave:
        raise HTTPException(400, "Cannot edit auto-generated leave entries")

    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(entry, field, val)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}")
def delete_entry(
    entry_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    entry = db.query(TimesheetEntry).filter(
        TimesheetEntry.id == entry_id,
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.user_id == user_id,
    ).first()
    if not entry:
        raise HTTPException(404, "Entry not found")
    if entry.status not in ("draft", "rejected"):
        raise HTTPException(400, "Can only delete draft or rejected entries")
    if entry.is_leave:
        raise HTTPException(400, "Cannot delete auto-generated leave entries")
    db.delete(entry)
    db.commit()
    return {"ok": True}
