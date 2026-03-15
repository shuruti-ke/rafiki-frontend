"""
backend/app/services/agent_tools.py
Sprint 6 — Agentic tool implementations for Rafiki AI chat.

All DB access mirrors the exact table/column names, ORM models, and business
logic already used in the live routers:
  - leave.py        → leave_applications, leave_balances, leave_policies
  - timesheets.py   → TimesheetEntry ORM model  (app.models.timesheet)
  - calendar router → calendar_events table (raw SQL, matches CalendarEventCreate schema)
  - objectives      → objectives / key_results tables

Each function receives (args_dict, user_id, org_id, db) and returns a plain
dict that is JSON-serialised back to the model as the tool result content.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Tool schema definitions (Anthropic-style input_schema; chat.py converts to OpenAI format)
# ──────────────────────────────────────────────────────────────────────────────

TOOL_DEFINITIONS = [
    {
        "name": "check_leave_balance",
        "description": (
            "Check the current employee's leave balance — shows entitled days, "
            "used days, carried-over days, and available days for each leave type "
            "(annual, sick, maternity/paternity, and any custom types). "
            "Call this before submitting a leave request."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "year": {
                    "type": "integer",
                    "description": "Leave year to check (defaults to current year)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "submit_leave_request",
        "description": (
            "Submit a leave application on behalf of the employee via POST /api/v1/leave/apply. "
            "Always call check_leave_balance first. "
            "Confirm dates and leave type with the employee before calling this tool. "
            "The backend validates balance and overlapping applications automatically."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "leave_type": {
                    "type": "string",
                    "description": "Type of leave: 'annual', 'sick', 'maternity', 'paternity', or a custom type name",
                },
                "start_date": {
                    "type": "string",
                    "description": "Start date in YYYY-MM-DD format",
                },
                "end_date": {
                    "type": "string",
                    "description": "End date in YYYY-MM-DD format",
                },
                "reason": {
                    "type": "string",
                    "description": "Optional reason / notes for the leave request",
                },
                "half_day": {
                    "type": "boolean",
                    "description": "True if this is a half-day request (defaults to false)",
                },
                "half_day_period": {
                    "type": "string",
                    "description": "If half_day is true: 'morning' or 'afternoon'",
                },
            },
            "required": ["leave_type", "start_date", "end_date"],
        },
    },
    {
        "name": "get_my_leave_applications",
        "description": (
            "Retrieve the employee's leave application history. "
            "Optionally filter by status: 'pending', 'approved', 'rejected', 'cancelled'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Filter by status: 'pending', 'approved', 'rejected', 'cancelled' (omit for all)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "check_calendar_events",
        "description": (
            "Retrieve the employee's upcoming calendar events within a date range "
            "(defaults to today + 7 days)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "start_date": {
                    "type": "string",
                    "description": "Start date in YYYY-MM-DD format (defaults to today)",
                },
                "end_date": {
                    "type": "string",
                    "description": "End date in YYYY-MM-DD format (defaults to 7 days from today)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "create_calendar_event",
        "description": (
            "Create a new calendar event for the employee. "
            "Requires title and start_time. end_time, description, and location are optional."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Event title",
                },
                "start_time": {
                    "type": "string",
                    "description": "Start datetime in ISO 8601 format, e.g. 2025-07-15T09:00:00",
                },
                "end_time": {
                    "type": "string",
                    "description": "End datetime in ISO 8601 format (optional; defaults to 1 hour after start)",
                },
                "description": {
                    "type": "string",
                    "description": "Optional event description or agenda",
                },
                "location": {
                    "type": "string",
                    "description": "Optional location string",
                },
                "event_type": {
                    "type": "string",
                    "description": "Event type: 'meeting', 'reminder', 'personal', 'training' (default: 'meeting')",
                },
                "is_virtual": {
                    "type": "boolean",
                    "description": "True if the meeting is virtual/online",
                },
                "meeting_link": {
                    "type": "string",
                    "description": "Video call link (if virtual)",
                },
            },
            "required": ["title", "start_time"],
        },
    },
    {
        "name": "check_timesheet",
        "description": (
            "Check the employee's timesheet entries for a given week. "
            "Returns entries, total hours, and a daily breakdown. "
            "week_start must be a Monday."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "week_start": {
                    "type": "string",
                    "description": "Monday of the week to check in YYYY-MM-DD format (defaults to current week's Monday)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "submit_timesheet_entry",
        "description": (
            "Create a new draft timesheet entry for the employee via POST /api/v1/timesheets/. "
            "The entry starts as 'draft' status — the employee still needs to submit it for approval. "
            "Requires: date, project, and hours. "
            "category defaults to 'Development'. "
            "Do NOT use for leave days — those are auto-created by the leave system."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "description": "Work date in YYYY-MM-DD format",
                },
                "project": {
                    "type": "string",
                    "description": "Project name or code",
                },
                "hours": {
                    "type": "number",
                    "description": "Number of hours worked (e.g. 8.0). Must be > 0 and ≤ 24.",
                },
                "category": {
                    "type": "string",
                    "description": "Category: 'Development', 'Meetings', 'Code Review', 'Documentation', 'Testing', 'Design', 'Research', 'Admin', 'Training', 'Support', 'Other' (default: 'Development')",
                },
                "description": {
                    "type": "string",
                    "description": "Optional description of work done",
                },
                "objective_id": {
                    "type": "string",
                    "description": "Optional UUID of an objective this work relates to",
                },
            },
            "required": ["date", "project", "hours"],
        },
    },
    {
        "name": "check_objectives",
        "description": (
            "Retrieve the employee's current OKRs / objectives with progress percentages and key results."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "search_knowledge_base",
        "description": (
            "Search the company knowledge base / policy documents for information. "
            "Use for questions about HR policies, company procedures, benefits, leave policies, etc."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query — the policy or topic to look up",
                },
            },
            "required": ["query"],
        },
    },
]


# ──────────────────────────────────────────────────────────────────────────────
# Dispatcher
# ──────────────────────────────────────────────────────────────────────────────

def execute_tool(
    tool_name: str,
    tool_input: dict,
    user_id: UUID,
    org_id: UUID,
    db: Session,
) -> dict:
    """Route a tool call to the correct handler and return a result dict."""
    handlers = {
        "check_leave_balance":       _check_leave_balance,
        "submit_leave_request":      _submit_leave_request,
        "get_my_leave_applications": _get_my_leave_applications,
        "check_calendar_events":     _check_calendar_events,
        "create_calendar_event":     _create_calendar_event,
        "check_timesheet":           _check_timesheet,
        "submit_timesheet_entry":    _submit_timesheet_entry,
        "check_objectives":          _check_objectives,
        "search_knowledge_base":     _search_knowledge_base,
    }
    handler = handlers.get(tool_name)
    if not handler:
        return {"error": f"Unknown tool: {tool_name}"}
    try:
        return handler(tool_input, user_id, org_id, db)
    except Exception as exc:
        logger.error("Tool %s failed: %s", tool_name, exc, exc_info=True)
        return {"error": str(exc)}


# ──────────────────────────────────────────────────────────────────────────────
# Leave helpers — mirrors leave.py exactly
# ──────────────────────────────────────────────────────────────────────────────

def _get_policy(db: Session, org_id) -> dict | None:
    row = db.execute(
        text("SELECT * FROM leave_policies WHERE org_id = :org ORDER BY created_at DESC LIMIT 1"),
        {"org": str(org_id)},
    ).mappings().first()
    return dict(row) if row else None


_DEFAULT_POLICY = {
    "annual_leave_days": 21,
    "sick_leave_days": 10,
    "maternity_leave_days": 90,
    "paternity_leave_days": 14,
    "carry_over_days": 0,
    "carry_over_expiry_months": 3,
    "carry_over_policy": "none",
    "other_leave": [],
}


def _entitled_for_type(policy: dict, leave_type: str) -> float:
    mapping = {
        "annual":    policy.get("annual_leave_days", 21),
        "sick":      policy.get("sick_leave_days", 10),
        "maternity": policy.get("maternity_leave_days", 90),
        "paternity": policy.get("paternity_leave_days", 14),
    }
    if leave_type in mapping:
        return float(mapping[leave_type])
    for item in (policy.get("other_leave") or []):
        if isinstance(item, dict) and item.get("name", "").lower() == leave_type.lower():
            return float(item.get("days", 0))
    return 0.0


def _working_days(start: date, end: date) -> float:
    """Count working days (Mon–Fri) between two dates inclusive."""
    if end < start:
        return 0
    total = 0
    current = start
    while current <= end:
        if current.weekday() < 5:
            total += 1
        current += timedelta(days=1)
    return float(total)


def _get_or_create_balance(
    db: Session, user_id, org_id, year: int, leave_type: str,
    entitled: float = 0, policy: dict | None = None,
) -> dict:
    """Identical logic to leave.py _get_or_create_balance."""
    row = db.execute(
        text("""SELECT * FROM leave_balances
                WHERE user_id = :uid AND leave_year = :yr AND leave_type = :lt"""),
        {"uid": str(user_id), "yr": year, "lt": leave_type},
    ).mappings().first()
    if row:
        existing = dict(row)
        if float(existing["entitled_days"]) == 0 and entitled > 0:
            db.execute(
                text("""UPDATE leave_balances SET entitled_days = :ent
                        WHERE user_id = :uid AND leave_year = :yr AND leave_type = :lt"""),
                {"ent": entitled, "uid": str(user_id), "yr": year, "lt": leave_type},
            )
            db.commit()
            existing["entitled_days"] = entitled
        return existing

    carry = 0.0
    carry_expiry = None
    if year > date.today().year - 1 and policy:
        prev = db.execute(
            text("""SELECT * FROM leave_balances
                    WHERE user_id = :uid AND leave_year = :yr AND leave_type = :lt"""),
            {"uid": str(user_id), "yr": year - 1, "lt": leave_type},
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
                (id, user_id, org_id, leave_year, leave_type, entitled_days, used_days,
                 carried_over_days, carry_over_expiry)
                VALUES (:id, :uid, :org, :yr, :lt, :ent, 0, :carry, :expiry)"""),
        {"id": new_id, "uid": str(user_id), "org": str(org_id),
         "yr": year, "lt": leave_type, "ent": entitled,
         "carry": carry, "expiry": carry_expiry},
    )
    db.commit()
    row = db.execute(
        text("SELECT * FROM leave_balances WHERE id = :id"), {"id": new_id}
    ).mappings().first()
    return dict(row)


# ──────────────────────────────────────────────────────────────────────────────
# Tool handlers
# ──────────────────────────────────────────────────────────────────────────────

def _check_leave_balance(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    """Mirrors GET /api/v1/leave/balance."""
    yr = args.get("year") or date.today().year
    policy = _get_policy(db, org_id) or _DEFAULT_POLICY

    # Gender-based leave types (same logic as leave.py)
    gender_row = db.execute(
        text("SELECT gender FROM employee_profiles WHERE user_id = :uid LIMIT 1"),
        {"uid": str(user_id)},
    ).first()
    gender = str(gender_row[0]).lower() if gender_row and gender_row[0] else None

    if gender == "male":
        leave_types = ["annual", "sick", "paternity"]
    elif gender == "female":
        leave_types = ["annual", "sick", "maternity"]
    else:
        leave_types = ["annual", "sick", "maternity", "paternity"]

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
            "available_days": max(0.0, available),
            "carry_over_expired": carry_expired,
        })

    return {"year": yr, "balances": balances}


def _submit_leave_request(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    """Mirrors POST /api/v1/leave/apply — uses the same validation logic."""
    leave_type = args.get("leave_type", "").lower().strip()
    start_str  = args.get("start_date", "")
    end_str    = args.get("end_date", "")
    reason     = args.get("reason", "")
    half_day   = bool(args.get("half_day", False))
    half_day_period = args.get("half_day_period")

    if not leave_type or not start_str or not end_str:
        return {"success": False, "error": "leave_type, start_date, and end_date are required."}

    try:
        start = date.fromisoformat(start_str)
        end   = date.fromisoformat(end_str)
    except ValueError:
        return {"success": False, "error": "Invalid date format. Use YYYY-MM-DD."}

    if end < start:
        return {"success": False, "error": "end_date must be on or after start_date."}

    working = 0.5 if half_day else _working_days(start, end)
    if working <= 0:
        return {"success": False, "error": "No working days in the selected date range."}

    # Balance check
    policy  = _get_policy(db, org_id) or _DEFAULT_POLICY
    yr      = start.year
    entitled = _entitled_for_type(policy, leave_type)
    bal     = _get_or_create_balance(db, user_id, org_id, yr, leave_type, entitled, policy)
    available = float(bal["entitled_days"]) + float(bal["carried_over_days"]) - float(bal["used_days"])
    if bal.get("carry_over_expiry") and date.today() > bal["carry_over_expiry"]:
        available = float(bal["entitled_days"]) - float(bal["used_days"])
    available = max(0.0, available)

    if working > available:
        return {
            "success": False,
            "error": (
                f"Insufficient leave balance. You have {available:.1f} days of {leave_type} leave "
                f"available, but requested {working:.1f} days."
            ),
        }

    # Overlap check
    overlap = db.execute(
        text("""SELECT id FROM leave_applications
                WHERE user_id = :uid AND status IN ('pending','approved')
                AND NOT (end_date < :start OR start_date > :end)"""),
        {"uid": str(user_id), "start": start, "end": end},
    ).first()
    if overlap:
        return {
            "success": False,
            "error": "You already have a leave application covering these dates.",
        }

    app_id = str(uuid.uuid4())
    db.execute(
        text("""INSERT INTO leave_applications
                (id, org_id, user_id, leave_type, start_date, end_date, working_days,
                 reason, half_day, half_day_period)
                VALUES (:id, :org, :uid, :lt, :sd, :ed, :wd, :reason, :hd, :hdp)"""),
        {
            "id": app_id, "org": str(org_id), "uid": str(user_id),
            "lt": leave_type, "sd": start, "ed": end,
            "wd": working, "reason": reason,
            "hd": half_day, "hdp": half_day_period,
        },
    )
    db.commit()

    # Notify HR admins (mirrors leave.py apply endpoint — non-fatal)
    try:
        from app.routers.notifications import _insert_notification
        from app.models.user import User as _User
        managers = db.query(_User.user_id).filter(
            _User.org_id == org_id,
            _User.role.in_(["hr_admin", "super_admin"]),
            _User.is_active == True,
        ).all()
        for (mgr_id,) in managers:
            _insert_notification(
                db, user_id=mgr_id, org_id=org_id,
                kind="leave_pending",
                title=f"Leave request: {leave_type} ({start} → {end})",
                body=f"{working:.0f} working day(s) · {reason or 'No reason given'}",
                link="/admin/leave",
            )
        db.commit()
    except Exception as _e:
        logger.warning("Agent leave submit notification failed (non-fatal): %s", _e)

    return {
        "success": True,
        "application_id": app_id,
        "leave_type": leave_type,
        "start_date": str(start),
        "end_date": str(end),
        "working_days": working,
        "status": "pending",
        "message": (
            f"Leave application submitted. {working:.0f} day(s) of {leave_type} leave "
            f"from {start.strftime('%d %b %Y')} to {end.strftime('%d %b %Y')} is now pending HR approval."
        ),
    }


def _get_my_leave_applications(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    """Mirrors GET /api/v1/leave/my-applications."""
    status = args.get("status")
    q = "SELECT * FROM leave_applications WHERE user_id = :uid"
    params: dict = {"uid": str(user_id)}
    if status:
        q += " AND status = :status"
        params["status"] = status
    q += " ORDER BY created_at DESC LIMIT 20"
    rows = db.execute(text(q), params).mappings().all()
    applications = []
    for r in rows:
        d = dict(r)
        # Serialise date/datetime fields
        for k in ("start_date", "end_date", "created_at", "updated_at", "reviewed_at"):
            if d.get(k) is not None:
                d[k] = str(d[k])
        applications.append(d)
    return {"applications": applications}


def _check_calendar_events(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    today = date.today()
    start_str = args.get("start_date") or today.isoformat()
    end_str   = args.get("end_date") or (today + timedelta(days=7)).isoformat()

    try:
        rows = db.execute(
            text("""
                SELECT id, title, description, start_time, end_time,
                       is_all_day, event_type, location, is_virtual, meeting_link, color
                FROM calendar_events
                WHERE user_id = :uid
                  AND DATE(start_time) BETWEEN :sd AND :ed
                ORDER BY start_time
                LIMIT 20
            """),
            {"uid": str(user_id), "sd": start_str, "ed": end_str},
        ).fetchall()

        events = [
            {
                "id":           str(r[0]),
                "title":        r[1],
                "description":  r[2] or "",
                "start":        r[3].isoformat() if r[3] else None,
                "end":          r[4].isoformat() if r[4] else None,
                "is_all_day":   r[5],
                "event_type":   r[6] or "meeting",
                "location":     r[7] or "",
                "is_virtual":   r[8],
                "meeting_link": r[9] or "",
                "color":        r[10] or "#8b5cf6",
            }
            for r in rows
        ]
        return {"events": events, "range": {"start": start_str, "end": end_str}}

    except Exception as exc:
        logger.warning("check_calendar_events DB error: %s", exc)
        return {"events": [], "note": "Could not retrieve calendar data."}


def _create_calendar_event(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    """Mirrors the calendar event INSERT used by the calendar router."""
    title       = (args.get("title") or "").strip()
    start_str   = args.get("start_time") or ""
    end_str     = args.get("end_time") or ""
    description = args.get("description") or ""
    location    = args.get("location") or ""
    event_type  = args.get("event_type") or "meeting"
    is_virtual  = bool(args.get("is_virtual", False))
    meeting_link = args.get("meeting_link") or ""

    if not title or not start_str:
        return {"success": False, "error": "title and start_time are required."}

    try:
        start_dt = datetime.fromisoformat(start_str)
        end_dt   = datetime.fromisoformat(end_str) if end_str else start_dt + timedelta(hours=1)
    except ValueError:
        return {"success": False, "error": "Invalid datetime format. Use ISO 8601, e.g. 2025-07-15T09:00:00."}

    try:
        new_id = str(uuid.uuid4())
        db.execute(
            text("""
                INSERT INTO calendar_events
                    (id, org_id, user_id, title, description, start_time, end_time,
                     event_type, location, is_virtual, meeting_link,
                     is_all_day, is_shared, color, created_at, updated_at)
                VALUES
                    (:id, :org, :uid, :title, :desc, :sd, :ed,
                     :etype, :loc, :virtual, :mlink,
                     FALSE, FALSE, '#8b5cf6', NOW(), NOW())
            """),
            {
                "id":    new_id,
                "org":   str(org_id),
                "uid":   str(user_id),
                "title": title,
                "desc":  description,
                "sd":    start_dt,
                "ed":    end_dt,
                "etype": event_type,
                "loc":   location,
                "virtual": is_virtual,
                "mlink": meeting_link,
            },
        )
        db.commit()
        return {
            "success":    True,
            "event_id":   new_id,
            "title":      title,
            "start":      start_dt.isoformat(),
            "end":        end_dt.isoformat(),
            "event_type": event_type,
            "message":    f"'{title}' added to your calendar for {start_dt.strftime('%A, %d %B %Y at %H:%M')}.",
        }
    except Exception as exc:
        db.rollback()
        logger.error("create_calendar_event DB error: %s", exc)
        return {"success": False, "error": "Database error — could not create calendar event."}


def _check_timesheet(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    """Mirrors GET /api/v1/timesheets/summary/weekly but via ORM to match TimesheetEntry model."""
    today = date.today()
    default_monday = today - timedelta(days=today.weekday())
    week_start_str = args.get("week_start") or default_monday.isoformat()

    try:
        week_start = date.fromisoformat(week_start_str)
    except ValueError:
        return {"error": "Invalid week_start format. Use YYYY-MM-DD (must be a Monday)."}

    week_end = week_start + timedelta(days=6)

    try:
        from app.models.timesheet import TimesheetEntry

        entries = (
            db.query(TimesheetEntry)
            .filter(
                TimesheetEntry.org_id  == org_id,
                TimesheetEntry.user_id == user_id,
                TimesheetEntry.date    >= week_start,
                TimesheetEntry.date    <= week_end,
            )
            .order_by(TimesheetEntry.date)
            .all()
        )

        total_hours = 0.0
        by_day: dict[str, float] = {}
        entry_list = []
        for e in entries:
            h = float(e.hours)
            ds = str(e.date)
            total_hours += h
            by_day[ds] = by_day.get(ds, 0) + h
            entry_list.append({
                "id":          str(e.id),
                "date":        ds,
                "project":     e.project,
                "category":    e.category,
                "hours":       h,
                "description": e.description or "",
                "status":      e.status,
                "is_leave":    e.is_leave,
            })

        return {
            "week_start":     str(week_start),
            "week_end":       str(week_end),
            "entries":        entry_list,
            "total_hours":    round(total_hours, 2),
            "by_day":         by_day,
            "expected_hours": 40.0,
        }
    except Exception as exc:
        logger.warning("check_timesheet error: %s", exc)
        return {"entries": [], "note": "Could not retrieve timesheet data."}


def _submit_timesheet_entry(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    """Mirrors POST /api/v1/timesheets/ — creates a TimesheetEntry ORM record."""
    date_str    = args.get("date", "")
    project     = (args.get("project") or "").strip()
    hours_raw   = args.get("hours")
    category    = args.get("category") or "Development"
    description = args.get("description") or ""
    objective_id_str = args.get("objective_id")

    if not date_str or not project or hours_raw is None:
        return {"success": False, "error": "date, project, and hours are required."}

    try:
        work_date = date.fromisoformat(date_str)
    except ValueError:
        return {"success": False, "error": "Invalid date format. Use YYYY-MM-DD."}

    try:
        hours = Decimal(str(hours_raw))
    except Exception:
        return {"success": False, "error": "Invalid hours value."}

    if hours <= 0 or hours > 24:
        return {"success": False, "error": "Hours must be between 0 and 24."}

    objective_id = None
    if objective_id_str:
        try:
            objective_id = uuid.UUID(objective_id_str)
        except ValueError:
            pass

    try:
        from app.models.timesheet import TimesheetEntry

        entry = TimesheetEntry(
            org_id      = org_id,
            user_id     = user_id,
            date        = work_date,
            project     = project,
            activity_type = "project",
            category    = category,
            hours       = hours,
            description = description,
            objective_id = objective_id,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)

        return {
            "success":     True,
            "entry_id":    str(entry.id),
            "date":        str(entry.date),
            "project":     entry.project,
            "hours":       float(entry.hours),
            "category":    entry.category,
            "status":      entry.status,  # "draft"
            "message": (
                f"Timesheet entry created: {float(hours):.1f}h on {project} "
                f"for {work_date.strftime('%A, %d %B %Y')} (status: draft). "
                "You'll need to submit it for manager approval."
            ),
        }
    except Exception as exc:
        db.rollback()
        logger.error("submit_timesheet_entry error: %s", exc)
        return {"success": False, "error": "Database error — could not create timesheet entry."}


def _check_objectives(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    try:
        rows = db.execute(
            text("""
                SELECT id, title, description, status, progress, target_date, created_at
                FROM objectives
                WHERE user_id = :uid
                  AND status NOT IN ('cancelled', 'archived')
                ORDER BY created_at DESC
                LIMIT 10
            """),
            {"uid": str(user_id)},
        ).fetchall()

        objectives = []
        for r in rows:
            obj_id = r[0]
            kr_rows = db.execute(
                text("""
                    SELECT title, target_value, current_value, unit
                    FROM key_results
                    WHERE objective_id = :oid
                    ORDER BY id
                """),
                {"oid": str(obj_id)},
            ).fetchall()
            key_results = [
                {
                    "title":   kr[0],
                    "target":  float(kr[1]) if kr[1] is not None else None,
                    "current": float(kr[2]) if kr[2] is not None else None,
                    "unit":    kr[3] or "",
                }
                for kr in kr_rows
            ]
            objectives.append({
                "id":          str(obj_id),
                "title":       r[1],
                "description": r[2] or "",
                "status":      r[3],
                "progress":    int(r[4]) if r[4] is not None else 0,
                "target_date": str(r[5]) if r[5] else None,
                "key_results": key_results,
            })
        return {"objectives": objectives}

    except Exception as exc:
        logger.warning("check_objectives DB error: %s", exc)
        return {"objectives": [], "note": "Could not retrieve objectives data."}


def _search_knowledge_base(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    query = (args.get("query") or "").strip()
    if not query:
        return {"results": [], "error": "Query is required."}

    try:
        rows = db.execute(
            text("""
                SELECT id, title, content, category, updated_at
                FROM knowledge_base_articles
                WHERE org_id = :oid
                  AND is_published = TRUE
                  AND (
                      to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(content,''))
                      @@ plainto_tsquery('english', :q)
                      OR title   ILIKE :ql
                      OR content ILIKE :ql
                  )
                ORDER BY
                    ts_rank(
                        to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(content,'')),
                        plainto_tsquery('english', :q)
                    ) DESC
                LIMIT 5
            """),
            {"oid": str(org_id), "q": query, "ql": f"%{query}%"},
        ).fetchall()

        results = [
            {
                "id":       str(r[0]),
                "title":    r[1],
                "snippet":  (r[2] or "")[:500],
                "category": r[3] or "General",
                "updated":  str(r[4]) if r[4] else None,
            }
            for r in rows
        ]
        return {"results": results, "query": query}

    except Exception as exc:
        logger.warning("search_knowledge_base DB error: %s", exc)
        return {"results": [], "note": "Could not search knowledge base."}
