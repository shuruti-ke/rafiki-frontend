"""Timesheets router."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
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


# ── CRUD ──


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


# ── Submit / Approve ──


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


# ── Team entries (manager view) ──


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


# ── Summaries ──


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
    total = sum(float(e.hours) for e in entries)
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
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)

    entries = db.query(TimesheetEntry).filter(
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.user_id == user_id,
        TimesheetEntry.date >= start,
        TimesheetEntry.date <= end,
    ).all()
    total = sum(float(e.hours) for e in entries)
    by_project = {}
    for e in entries:
        by_project[e.project] = by_project.get(e.project, 0) + float(e.hours)
    return {
        "year": year, "month": month, "total_hours": total,
        "by_project": by_project, "entries": len(entries),
    }


# ── AI feed ──


@router.get("/ai-feed")
def ai_feed(
    days: int = Query(default=7, ge=1, le=90),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    start = date.today() - timedelta(days=days)
    entries = db.query(TimesheetEntry).filter(
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.user_id == user_id,
        TimesheetEntry.date >= start,
    ).order_by(TimesheetEntry.date).all()

    total = sum(float(e.hours) for e in entries)
    by_project = {}
    by_category = {}
    for e in entries:
        by_project[e.project] = by_project.get(e.project, 0) + float(e.hours)
        by_category[e.category] = by_category.get(e.category, 0) + float(e.hours)

    return {
        "period_days": days,
        "total_hours": total,
        "avg_daily": round(total / max(days, 1), 1),
        "by_project": by_project,
        "by_category": by_category,
        "entry_count": len(entries),
    }


# ── Categories / Projects ──


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
    ).distinct().all()
    return sorted(set(r[0] for r in rows))


# ── Single-entry endpoints (must be AFTER all fixed paths) ──


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
    db.delete(entry)
    db.commit()
    return {"ok": True}
