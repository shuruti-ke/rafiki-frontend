"""
Rafiki@Work — Timesheet Service (PostgreSQL)

Uses: app.models.timesheet.TimesheetEntry
Replace: backend/app/routers/timesheets.py

CRITICAL FIX: Static routes (/projects, /categories, /submit, /summary/*)
MUST come BEFORE /{entry_id} or FastAPI matches "projects" as a UUID → 422.
"""

import logging
import uuid
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc

from app.database import get_db
from app.models.timesheet import TimesheetEntry
from app.dependencies import get_current_user_id, get_current_org_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/timesheets", tags=["timesheets"])

VALID_CATEGORIES = [
    "Development", "Meetings", "Code Review", "Documentation", "Testing",
    "Design", "Research", "Admin", "Training", "Support", "Other",
    "Client Communication", "Planning", "Mentoring",
]
VALID_STATUSES = ["draft", "submitted", "approved", "rejected"]


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def _to_dict(e: TimesheetEntry) -> dict:
    return {
        "id": str(e.id),
        "org_id": str(e.org_id) if e.org_id else None,
        "user_id": str(e.user_id),
        "date": e.date.isoformat() if e.date else "",
        "project": e.project,
        "category": e.category,
        "hours": float(e.hours),
        "description": e.description or "",
        "objective_id": str(e.objective_id) if e.objective_id else None,
        "status": e.status,
        "submitted_at": e.submitted_at.isoformat() if e.submitted_at else None,
        "approved_by": str(e.approved_by) if e.approved_by else None,
        "approved_at": e.approved_at.isoformat() if e.approved_at else None,
        "approval_comment": e.approval_comment or "",
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
    }


def _parse_date(s: str) -> date:
    return date.fromisoformat(s[:10])


def _safe_uuid(val) -> Optional[uuid.UUID]:
    if not val:
        return None
    if isinstance(val, uuid.UUID):
        return val
    try:
        return uuid.UUID(str(val))
    except (ValueError, AttributeError):
        return None


def _week_dates(d: date) -> list[date]:
    monday = d - timedelta(days=d.weekday())
    return [monday + timedelta(days=i) for i in range(7)]


def _month_dates(year: int, month: int) -> list[date]:
    d = date(year, month, 1)
    dates = []
    while d.month == month:
        dates.append(d)
        d += timedelta(days=1)
    return dates


# ──────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────

class EntryCreate(BaseModel):
    date: str
    project: str = Field(..., min_length=1, max_length=200)
    category: str = "Development"
    hours: float = Field(..., gt=0, le=24)
    description: str = ""
    objective_id: Optional[str] = None


class EntryUpdate(BaseModel):
    date: Optional[str] = None
    project: Optional[str] = None
    category: Optional[str] = None
    hours: Optional[float] = Field(None, gt=0, le=24)
    description: Optional[str] = None
    objective_id: Optional[str] = None


class SubmitRequest(BaseModel):
    entry_ids: List[str]


class ApprovalRequest(BaseModel):
    status: str = "approved"
    comment: str = ""


# ══════════════════════════════════════════════
# STATIC ROUTES — MUST be before /{entry_id}
# ══════════════════════════════════════════════


# ── PROJECTS  (was causing 422) ──

@router.get("/projects")
def list_projects(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    """Return distinct projects for autocomplete. No query params needed — auth provides user."""
    rows = db.query(TimesheetEntry.project).filter(
        TimesheetEntry.user_id == user_id,
        TimesheetEntry.org_id == org_id,
    ).distinct().all()
    return sorted(r[0] for r in rows)


# ── CATEGORIES ──

@router.get("/categories")
def list_categories():
    return VALID_CATEGORIES


# ── SUBMIT ──

@router.post("/submit")
def submit_timesheets(
    payload: SubmitRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    """Submit draft entries. Frontend sends {entry_ids: ["uuid1", ...]}."""
    now = datetime.now(timezone.utc)
    submitted = 0
    for eid_str in payload.entry_ids:
        eid = _safe_uuid(eid_str)
        if not eid:
            continue
        e = db.query(TimesheetEntry).filter(
            TimesheetEntry.id == eid,
            TimesheetEntry.user_id == user_id,
            TimesheetEntry.org_id == org_id,
            TimesheetEntry.status == "draft",
        ).first()
        if e:
            e.status = "submitted"
            e.submitted_at = now
            submitted += 1
    if submitted == 0:
        raise HTTPException(404, "No draft entries found for the given IDs")
    db.commit()
    return {"ok": True, "submitted": submitted}


# ── SUMMARY: DAILY ──

@router.get("/summary/daily")
def daily_summary(
    date_str: str = Query(..., alias="date"),
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    d = _parse_date(date_str)
    entries = db.query(TimesheetEntry).filter(
        TimesheetEntry.user_id == user_id,
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.date == d,
    ).all()
    total = sum(float(e.hours) for e in entries)
    by_project, by_category = {}, {}
    for e in entries:
        by_project[e.project] = round(by_project.get(e.project, 0) + float(e.hours), 1)
        by_category[e.category] = round(by_category.get(e.category, 0) + float(e.hours), 1)
    return {
        "date": date_str,
        "total_hours": round(total, 1),
        "target_hours": 8,
        "utilization_pct": round(min(total / 8 * 100, 100), 1) if total else 0,
        "entries": len(entries),
        "by_project": by_project,
        "by_category": by_category,
    }


# ── SUMMARY: WEEKLY — keys match frontend KPI cards ──

@router.get("/summary/weekly")
def weekly_summary(
    week_start: str = Query(...),
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    week = _week_dates(_parse_date(week_start))
    all_entries = db.query(TimesheetEntry).filter(
        TimesheetEntry.user_id == user_id,
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.date.in_(week),
    ).all()

    total = sum(float(e.hours) for e in all_entries)
    by_project, by_category, by_day = {}, {}, {}
    for d in week:
        day_hours = sum(float(e.hours) for e in all_entries if e.date == d)
        if day_hours > 0:
            by_day[d.isoformat()] = round(day_hours, 1)
    for e in all_entries:
        by_project[e.project] = round(by_project.get(e.project, 0) + float(e.hours), 1)
        by_category[e.category] = round(by_category.get(e.category, 0) + float(e.hours), 1)

    return {
        "week_start": week_start,
        "total_hours": round(total, 1),
        "target_hours": 40,
        "utilization_pct": round(min(total / 40 * 100, 100), 1) if total else 0,
        "entries": len(all_entries),
        "by_day": by_day,
        "by_project": by_project,
        "by_category": by_category,
        "statuses": {s: len([e for e in all_entries if e.status == s]) for s in VALID_STATUSES},
    }


# ── SUMMARY: MONTHLY ──

@router.get("/summary/monthly")
def monthly_summary(
    month: str = Query(..., description="YYYY-MM"),
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    parts = month.split("-")
    year, mo = int(parts[0]), int(parts[1])
    all_dates = _month_dates(year, mo)
    work_days = len([d for d in all_dates if d.weekday() < 5])
    target = work_days * 8

    entries = db.query(TimesheetEntry).filter(
        TimesheetEntry.user_id == user_id,
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.date.in_(all_dates),
    ).all()

    total = sum(float(e.hours) for e in entries)
    by_project, by_category, by_day, weekly = {}, {}, {}, {}
    for e in entries:
        by_project[e.project] = round(by_project.get(e.project, 0) + float(e.hours), 1)
        by_category[e.category] = round(by_category.get(e.category, 0) + float(e.hours), 1)
        ds = e.date.isoformat()
        by_day[ds] = round(by_day.get(ds, 0) + float(e.hours), 1)
        wk = f"W{(e.date.day - 1) // 7 + 1}"
        weekly[wk] = round(weekly.get(wk, 0) + float(e.hours), 1)

    return {
        "month": month,
        "total_hours": round(total, 1),
        "target_hours": target,
        "work_days": work_days,
        "utilization_pct": round(min(total / target * 100, 100) if target else 0, 1),
        "entries": len(entries),
        "by_project": by_project,
        "by_category": by_category,
        "by_day": by_day,
        "weekly_breakdown": weekly,
        "statuses": {s: len([e for e in entries if e.status == s]) for s in VALID_STATUSES},
    }


# ── AI FEED (for user_context.py) ──

@router.get("/ai-feed")
def ai_performance_feed(
    months: int = Query(3, ge=1, le=12),
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    cutoff = date.today() - timedelta(days=months * 30)
    entries = db.query(TimesheetEntry).filter(
        TimesheetEntry.user_id == user_id,
        TimesheetEntry.org_id == org_id,
        TimesheetEntry.date >= cutoff,
    ).all()
    total = sum(float(e.hours) for e in entries)
    unique_dates = set(e.date for e in entries)
    work_days = len(unique_dates)
    by_project, by_category, by_obj = {}, {}, {}
    for e in entries:
        by_project[e.project] = round(by_project.get(e.project, 0) + float(e.hours), 1)
        by_category[e.category] = round(by_category.get(e.category, 0) + float(e.hours), 1)
        if e.objective_id:
            k = str(e.objective_id)
            by_obj[k] = round(by_obj.get(k, 0) + float(e.hours), 1)
    cat_pct = {c: round(h / total * 100, 1) for c, h in by_category.items()} if total else {}
    return {
        "user_id": str(user_id), "period_months": months,
        "total_hours": round(total, 1), "work_days_logged": work_days,
        "avg_daily_hours": round(total / work_days, 1) if work_days else 0,
        "time_by_project": by_project, "time_by_category": by_category,
        "category_percentages": cat_pct, "time_by_objective": by_obj,
        "kpi_indicators": {
            "utilization": round(total / (work_days * 8) * 100, 1) if work_days else 0,
            "consistency": round(work_days / (months * 22) * 100, 1),
            "project_diversity": len(by_project),
            "skill_coverage": len(by_category),
        },
    }


# ══════════════════════════════════════════════
# DYNAMIC ROUTES — /{entry_id} AFTER static routes
# ══════════════════════════════════════════════


# ── LIST ──

@router.get("/")
def list_entries(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    project: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    q = db.query(TimesheetEntry).filter(
        TimesheetEntry.user_id == user_id,
        TimesheetEntry.org_id == org_id,
    )
    if start:
        q = q.filter(TimesheetEntry.date >= _parse_date(start))
    if end:
        q = q.filter(TimesheetEntry.date <= _parse_date(end))
    if status:
        q = q.filter(TimesheetEntry.status == status)
    if project:
        q = q.filter(TimesheetEntry.project == project)
    entries = q.order_by(TimesheetEntry.date.desc(), TimesheetEntry.created_at.desc()).all()
    return [_to_dict(e) for e in entries]


# ── CREATE ──

@router.post("/", status_code=201)
def create_entry(
    payload: EntryCreate,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    if payload.category not in VALID_CATEGORIES:
        raise HTTPException(400, f"Invalid category. Must be one of: {VALID_CATEGORIES}")
    entry_date = _parse_date(payload.date)
    existing = db.query(
        sqlfunc.coalesce(sqlfunc.sum(TimesheetEntry.hours), 0)
    ).filter(
        TimesheetEntry.user_id == user_id, TimesheetEntry.date == entry_date,
    ).scalar()
    if float(existing) + payload.hours > 24:
        raise HTTPException(400, f"Total hours for {payload.date} would exceed 24h")
    entry = TimesheetEntry(
        org_id=org_id, user_id=user_id, date=entry_date,
        project=payload.project, category=payload.category,
        hours=Decimal(str(payload.hours)), description=payload.description or "",
        objective_id=_safe_uuid(payload.objective_id), status="draft",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _to_dict(entry)


# ── GET / UPDATE / DELETE by ID ──

@router.get("/{entry_id}")
def get_entry(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    e = db.query(TimesheetEntry).filter(
        TimesheetEntry.id == entry_id, TimesheetEntry.user_id == user_id, TimesheetEntry.org_id == org_id,
    ).first()
    if not e:
        raise HTTPException(404, "Entry not found")
    return _to_dict(e)


@router.put("/{entry_id}")
def update_entry(
    entry_id: uuid.UUID, payload: EntryUpdate,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    e = db.query(TimesheetEntry).filter(
        TimesheetEntry.id == entry_id, TimesheetEntry.user_id == user_id, TimesheetEntry.org_id == org_id,
    ).first()
    if not e:
        raise HTTPException(404, "Entry not found")
    if e.status not in ("draft", "rejected"):
        raise HTTPException(400, "Can only edit draft or rejected entries")
    updates = payload.model_dump(exclude_unset=True)
    if "category" in updates and updates["category"] not in VALID_CATEGORIES:
        raise HTTPException(400, "Invalid category")
    if "hours" in updates and updates["hours"] is not None:
        updates["hours"] = Decimal(str(updates["hours"]))
    if "date" in updates and updates["date"]:
        updates["date"] = _parse_date(updates["date"])
    if "objective_id" in updates:
        updates["objective_id"] = _safe_uuid(updates["objective_id"])
    for f, v in updates.items():
        setattr(e, f, v)
    db.commit()
    db.refresh(e)
    return _to_dict(e)


@router.delete("/{entry_id}")
def delete_entry(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    e = db.query(TimesheetEntry).filter(
        TimesheetEntry.id == entry_id, TimesheetEntry.user_id == user_id, TimesheetEntry.org_id == org_id,
    ).first()
    if not e:
        raise HTTPException(404, "Entry not found")
    if e.status not in ("draft", "rejected"):
        raise HTTPException(400, "Can only delete draft or rejected entries")
    db.delete(e)
    db.commit()
    return {"ok": True}


# ── APPROVE (manager action) ──

@router.post("/{entry_id}/approve")
def approve_entry(
    entry_id: uuid.UUID, payload: ApprovalRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    e = db.query(TimesheetEntry).filter(
        TimesheetEntry.id == entry_id, TimesheetEntry.org_id == org_id,
    ).first()
    if not e:
        raise HTTPException(404, "Entry not found")
    if e.status != "submitted":
        raise HTTPException(400, "Must be submitted first")
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(400, "Invalid status")
    e.status = payload.status
    e.approved_by = user_id
    e.approved_at = datetime.now(timezone.utc)
    e.approval_comment = payload.comment
    db.commit()
    db.refresh(e)
    return _to_dict(e)
