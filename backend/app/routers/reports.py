"""
backend/app/routers/reports.py
Sprint 5 — Rafiki HR | Cross-module HR Reporting Dashboard

Register in main.py:
    from app.routers.reports import router as reports_router
    app.include_router(reports_router)

Provides a single aggregation endpoint GET /api/v1/admin/reports/summary
plus a wellbeing trends passthrough to keep the frontend to 2 calls maximum.

Panels covered:
  1. Timesheet anomalies   — flagged entry count + top anomaly types by dept
  2. Leave balances        — avg days remaining per dept + top leave reasons
  3. Coaching outcomes     — completed vs overdue follow-ups
  4. Guided path rates     — completions per module, avg pre→post rating delta
  5. Wellbeing trends      — delegated to GET /api/v1/wellbeing/trend (existing)
                             Frontend calls that endpoint directly; no proxy needed.
"""

import logging
from uuid import UUID
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, func

from app.database import get_db
from app.dependencies import get_current_org_id, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin/reports", tags=["HR Reports"])


# ─────────────────────────────────────────────────────────────────────────────
# 1. TIMESHEET ANOMALIES  — aggregate flagged entries by department
# ─────────────────────────────────────────────────────────────────────────────

def _timesheet_anomalies(db: Session, org_id: UUID) -> dict:
    """
    Flag employees whose hours in the last full week are >40 % below their
    8-week rolling average OR below 20 h absolute.  Mirrors the logic in
    timesheets.py /admin/anomalies but returns a dept-level summary only
    (no PII row list) suitable for the reports dashboard.
    """
    today = date.today()
    # Last complete Mon–Sun week
    last_monday = today - timedelta(days=today.weekday() + 7)
    week_end    = last_monday + timedelta(days=6)
    rolling_start = last_monday - timedelta(weeks=8)
    rolling_end   = last_monday - timedelta(days=1)

    # Current week totals per employee
    current_rows = db.execute(text("""
        SELECT te.user_id, SUM(te.hours) AS total_hours, u.department
        FROM timesheet_entries te
        JOIN users_legacy u ON u.user_id = te.user_id
        WHERE te.org_id  = :org
          AND te.date   >= :ws
          AND te.date   <= :we
          AND te.is_leave = FALSE
        GROUP BY te.user_id, u.department
    """), {"org": str(org_id), "ws": last_monday, "we": week_end}).mappings().all()

    if not current_rows:
        return {"total_flagged": 0, "by_department": {}, "week_analysed": str(last_monday)}

    # Rolling average per employee
    rolling_rows = db.execute(text("""
        SELECT user_id, SUM(hours) / 8.0 AS weekly_avg
        FROM timesheet_entries
        WHERE org_id  = :org
          AND date   >= :rs
          AND date   <= :re
          AND is_leave = FALSE
        GROUP BY user_id
    """), {"org": str(org_id), "rs": rolling_start, "re": rolling_end}).mappings().all()

    rolling_map = {str(r["user_id"]): float(r["weekly_avg"]) for r in rolling_rows}

    by_dept: dict[str, int] = {}
    total_flagged = 0

    for row in current_rows:
        uid      = str(row["user_id"])
        hours    = float(row["total_hours"])
        dept     = row["department"] or "Unassigned"
        avg      = rolling_map.get(uid, 40.0)
        flagged  = hours < 20.0 or (avg > 0 and hours < avg * 0.6)
        if flagged:
            by_dept[dept] = by_dept.get(dept, 0) + 1
            total_flagged += 1

    # Top anomaly types — derived from status distribution of submitted entries
    anomaly_types_rows = db.execute(text("""
        SELECT status, COUNT(*) AS cnt
        FROM timesheet_entries
        WHERE org_id = :org
          AND date  >= :ws
          AND date  <= :we
          AND status IN ('rejected', 'draft')
        GROUP BY status
        ORDER BY cnt DESC
    """), {"org": str(org_id), "ws": last_monday, "we": week_end}).mappings().all()

    top_anomaly_types = {r["status"]: r["cnt"] for r in anomaly_types_rows}

    return {
        "total_flagged":    total_flagged,
        "by_department":    by_dept,          # {dept: count}
        "top_anomaly_types": top_anomaly_types, # {status: count}
        "week_analysed":    str(last_monday),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. LEAVE BALANCES  — avg days remaining per dept + top leave reasons
# ─────────────────────────────────────────────────────────────────────────────

def _leave_balances(db: Session, org_id: UUID) -> dict:
    yr = date.today().year

    # Average remaining days (entitled + carried_over - used) per department
    dept_rows = db.execute(text("""
        SELECT u.department,
               AVG(lb.entitled_days + lb.carried_over_days - lb.used_days) AS avg_remaining,
               COUNT(DISTINCT lb.user_id) AS employee_count
        FROM leave_balances lb
        JOIN users_legacy u ON u.user_id = lb.user_id
        WHERE lb.org_id    = :org
          AND lb.leave_year = :yr
        GROUP BY u.department
        ORDER BY avg_remaining ASC
    """), {"org": str(org_id), "yr": yr}).mappings().all()

    avg_by_dept = {
        (r["department"] or "Unassigned"): round(float(r["avg_remaining"]), 1)
        for r in dept_rows
    }

    # Top leave reasons from approved applications this year
    reason_rows = db.execute(text("""
        SELECT leave_type, COUNT(*) AS cnt
        FROM leave_applications
        WHERE org_id = :org
          AND EXTRACT(YEAR FROM start_date) = :yr
          AND status = 'approved'
        GROUP BY leave_type
        ORDER BY cnt DESC
        LIMIT 6
    """), {"org": str(org_id), "yr": yr}).mappings().all()

    top_reasons = {r["leave_type"]: r["cnt"] for r in reason_rows}

    # Pending applications requiring action
    pending = db.execute(text("""
        SELECT COUNT(*) FROM leave_applications
        WHERE org_id = :org AND status = 'pending'
    """), {"org": str(org_id)}).scalar() or 0

    return {
        "avg_remaining_by_dept": avg_by_dept,
        "top_leave_reasons":     top_reasons,
        "pending_applications":  int(pending),
        "year":                  yr,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. COACHING OUTCOMES  — completed vs overdue follow-ups
# ─────────────────────────────────────────────────────────────────────────────

def _coaching_outcomes(db: Session, org_id: UUID) -> dict:
    today = date.today()

    # Outcome distribution (last 90 days)
    since = datetime.now(timezone.utc) - timedelta(days=90)

    outcome_rows = db.execute(text("""
        SELECT outcome, COUNT(*) AS cnt
        FROM coaching_sessions
        WHERE org_id     = :org
          AND created_at >= :since
          AND outcome IS NOT NULL
        GROUP BY outcome
    """), {"org": str(org_id), "since": since}).mappings().all()

    outcomes = {r["outcome"]: r["cnt"] for r in outcome_rows}

    # Overdue follow-ups: follow_up_date < today AND outcome NOT resolved/cancelled
    overdue = db.execute(text("""
        SELECT COUNT(*) FROM coaching_sessions
        WHERE org_id         = :org
          AND follow_up_date < :today
          AND outcome NOT IN ('resolved')
          AND outcome IS NOT NULL
    """), {"org": str(org_id), "today": today}).scalar() or 0

    # Upcoming follow-ups: due within next 7 days
    upcoming = db.execute(text("""
        SELECT COUNT(*) FROM coaching_sessions
        WHERE org_id         = :org
          AND follow_up_date >= :today
          AND follow_up_date <= :next7
    """), {"org": str(org_id), "today": today, "next7": today + timedelta(days=7)}).scalar() or 0

    # Total sessions last 90 days
    total = db.execute(text("""
        SELECT COUNT(*) FROM coaching_sessions
        WHERE org_id = :org AND created_at >= :since
    """), {"org": str(org_id), "since": since}).scalar() or 0

    return {
        "outcomes":           outcomes,       # {outcome_label: count}
        "overdue_followups":  int(overdue),
        "upcoming_followups": int(upcoming),
        "total_sessions_90d": int(total),
        "period_days":        90,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. GUIDED PATH COMPLETION RATES
# ─────────────────────────────────────────────────────────────────────────────

def _guided_paths(db: Session, org_id: UUID) -> dict:
    """
    Completions per module + avg pre→post rating delta.
    Reads from guided_path_sessions (joined to guided_modules for names).
    Skips rows with NULL user_id (sprint4b migration artefact).
    """
    module_rows = db.execute(text("""
        SELECT
            gm.name                                    AS module_title,
            COUNT(gps.id)                              AS total_sessions,
            COUNT(gps.id) FILTER (WHERE gps.status = 'completed') AS completed,
            AVG(gps.post_rating - gps.pre_rating)
                FILTER (WHERE gps.pre_rating IS NOT NULL
                          AND gps.post_rating IS NOT NULL) AS avg_delta
        FROM guided_path_sessions gps
        JOIN guided_modules gm ON gm.id = gps.module_id
        WHERE gps.org_id  = :org
          AND gps.user_id IS NOT NULL
        GROUP BY gm.id, gm.name
        ORDER BY completed DESC
        LIMIT 10
    """), {"org": str(org_id)}).mappings().all()

    modules = []
    for r in module_rows:
        delta = float(r["avg_delta"]) if r["avg_delta"] is not None else None
        modules.append({
            "module":          r["module_title"],
            "total_sessions":  r["total_sessions"],
            "completed":       r["completed"],
            "completion_rate": round(r["completed"] / max(r["total_sessions"], 1) * 100, 1),
            "avg_rating_delta": round(delta, 2) if delta is not None else None,
        })

    # Overall org completion rate
    totals = db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*)                                      AS total
        FROM guided_path_sessions
        WHERE org_id = :org AND user_id IS NOT NULL
    """), {"org": str(org_id)}).mappings().first()

    overall_rate = 0.0
    if totals and totals["total"]:
        overall_rate = round(totals["completed"] / totals["total"] * 100, 1)

    return {
        "modules":           modules,
        "overall_completion_rate": overall_rate,
        "note": "Sessions with NULL user_id (pre-sprint4b) are excluded.",
    }


# ─────────────────────────────────────────────────────────────────────────────
# MAIN SUMMARY ENDPOINT
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/summary")
def reports_summary(
    db:     Session = Depends(get_db),
    org_id: UUID    = Depends(get_current_org_id),
    role:   str     = Depends(require_admin),
):
    """
    Single aggregation endpoint for the AdminReports dashboard.
    Returns data for 4 of the 5 panels.  The wellbeing panel calls
    GET /api/v1/wellbeing/dashboard directly (already returns what's needed).

    Response shape:
    {
      "timesheet_anomalies": { total_flagged, by_department, top_anomaly_types, week_analysed },
      "leave_balances":      { avg_remaining_by_dept, top_leave_reasons, pending_applications, year },
      "coaching_outcomes":   { outcomes, overdue_followups, upcoming_followups, total_sessions_90d },
      "guided_paths":        { modules[], overall_completion_rate },
    }
    """
    return {
        "timesheet_anomalies": _timesheet_anomalies(db, org_id),
        "leave_balances":      _leave_balances(db, org_id),
        "coaching_outcomes":   _coaching_outcomes(db, org_id),
        "guided_paths":        _guided_paths(db, org_id),
    }
