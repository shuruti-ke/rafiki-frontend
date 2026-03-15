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
            "Check leave balance — shows entitled, used, carried-over, and available days per leave type. "
            "Call for the current user, or for managers/HR use for_employee_id to check a team member's balance. "
            "Never exposes chat content."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "year": {
                    "type": "integer",
                    "description": "Leave year (defaults to current year)",
                },
                "for_employee_id": {
                    "type": "string",
                    "description": "Optional. UUID of employee to check (managers: team members only; HR: any org employee). Omit for current user.",
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
            "Retrieve leave application history. Use for_employee_id for managers/HR to see a team member's applications. Never exposes chat."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Filter: 'pending', 'approved', 'rejected', 'cancelled' (omit for all)",
                },
                "for_employee_id": {
                    "type": "string",
                    "description": "Optional. UUID of employee (managers/HR only). Omit for current user.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "check_calendar_events",
        "description": (
            "Retrieve upcoming calendar events. Use for_employee_id for managers/HR to see a team member's events. Never exposes chat."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "for_employee_id": {
                    "type": "string",
                    "description": "Optional. UUID of employee (managers/HR only). Omit for current user.",
                },
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
            "Check timesheet entries for a week. Use for_employee_id for managers/HR to see a team member's timesheet. Never exposes chat."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "week_start": {
                    "type": "string",
                    "description": "Monday of the week in YYYY-MM-DD (defaults to current week)",
                },
                "for_employee_id": {
                    "type": "string",
                    "description": "Optional. UUID of employee (managers/HR only). Omit for current user.",
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
            "Retrieve current OKRs/objectives with progress. Use for_employee_id for managers/HR to see a team member's objectives. Never exposes chat."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "for_employee_id": {
                    "type": "string",
                    "description": "Optional. UUID of employee (managers/HR only). Omit for current user.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_employee_profile",
        "description": (
            "Look up an employee's profile by name. Use immediately when a manager or HR admin "
            "mentions a person's name and asks about them. Returns profile, job title, department, "
            "manager, tenure, and a link to their data. Managers can only look up their own team; "
            "HR admins can look up any employee in the organisation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The employee's first name, last name, or full name",
                },
            },
            "required": ["name"],
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
    {
        "name": "search_my_documents",
        "description": (
            "Search the current user's own uploaded documents (contracts, certificates, ID documents, letters, etc.). "
            "Use when the user asks about something in their personal documents — e.g. 'what does my contract say', "
            "'find my certificate', 'check my NDA'. Only returns documents belonging to the current user."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query — what to look for in the user's personal documents",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_performance_reviews",
        "description": (
            "Retrieve performance review history for the current user or (for managers/HR) a team member. "
            "Use for questions about past reviews, ratings, feedback, and review cycles."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "for_employee_id": {
                    "type": "string",
                    "description": "Optional UUID of employee (managers/HR only). Omit for current user.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of reviews to return (default 5)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_announcements",
        "description": (
            "Retrieve recent company announcements visible to the current user. "
            "Use when the user asks about company news, updates, or announcements."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Max number of announcements to return (default 10)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_attendance",
        "description": (
            "Retrieve attendance records (clock-in/out times) for the current user or a team member. "
            "Use for questions about work hours, late arrivals, absences, or attendance history."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "start_date": {
                    "type": "string",
                    "description": "Start date in YYYY-MM-DD format (defaults to 7 days ago)",
                },
                "end_date": {
                    "type": "string",
                    "description": "End date in YYYY-MM-DD format (defaults to today)",
                },
                "for_employee_id": {
                    "type": "string",
                    "description": "Optional UUID of employee (managers/HR only). Omit for current user.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_payslips",
        "description": (
            "Retrieve payslip summaries for the current user. "
            "Use for questions about salary, net pay, deductions, or past payslips."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Max number of payslips to return (default 6)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_coaching_sessions",
        "description": (
            "Retrieve coaching sessions. For managers: returns sessions they have run. "
            "For employees: returns sessions where they are the subject. "
            "Managers/HR can pass for_employee_id to see sessions for a specific team member."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "for_employee_id": {
                    "type": "string",
                    "description": "Optional UUID of employee (managers/HR only). Omit for current user.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of sessions to return (default 10)",
                },
            },
            "required": [],
        },
    },
]


# ──────────────────────────────────────────────────────────────────────────────
# Dispatcher
# ──────────────────────────────────────────────────────────────────────────────

def _resolve_effective_user(
    tool_input: dict,
    caller_id: UUID,
    org_id: UUID,
    db: Session,
) -> tuple[UUID, dict]:
    """
    If tool_input has for_employee_id, validate that caller (manager/hr_admin) can access
    that employee. Returns (effective_user_id, tool_input_without_for_employee_id).
    Never exposes chat data.
    """
    from app.models.user import User
    from app.services.manager_scope import validate_employee_access

    for_id = tool_input.pop("for_employee_id", None)
    if not for_id:
        return caller_id, tool_input
    try:
        target = UUID(str(for_id))
    except (ValueError, TypeError):
        return caller_id, tool_input
    if target == caller_id:
        return caller_id, tool_input
    role_row = db.query(User).filter(User.user_id == caller_id).first()
    role = getattr(role_row, "role", None) if role_row else None
    role = (role or "").strip().lower()
    if role not in ("manager", "hr_admin", "super_admin") and "admin" not in role:
        logger.warning("for_employee_id used by non-manager/HR role=%s", role)
        return caller_id, tool_input
    if not validate_employee_access(db, caller_id, target, org_id):
        return caller_id, {**tool_input, "error": "You do not have access to this employee's data."}
    return target, tool_input


def execute_tool(
    tool_name: str,
    tool_input: dict,
    user_id: UUID,
    org_id: UUID,
    db: Session,
) -> dict:
    """Route a tool call to the correct handler. Managers/HR can pass for_employee_id for team/org member data. Chat is never exposed."""
    handlers = {
        "check_leave_balance":       _check_leave_balance,
        "submit_leave_request":      _submit_leave_request,
        "get_my_leave_applications": _get_my_leave_applications,
        "check_calendar_events":     _check_calendar_events,
        "create_calendar_event":     _create_calendar_event,
        "check_timesheet":           _check_timesheet,
        "submit_timesheet_entry":    _submit_timesheet_entry,
        "check_objectives":          _check_objectives,
        "get_employee_profile":      _get_employee_profile,
        "search_knowledge_base":     _search_knowledge_base,
        "search_my_documents":       _search_my_documents,
        "get_performance_reviews":   _get_performance_reviews,
        "get_announcements":         _get_announcements,
        "get_attendance":            _get_attendance,
        "get_payslips":              _get_payslips,
        "get_coaching_sessions":     _get_coaching_sessions,
    }
    handler = handlers.get(tool_name)
    if not handler:
        return {"error": f"Unknown tool: {tool_name}"}
    tool_input = dict(tool_input)
    effective_user_id, tool_input = _resolve_effective_user(tool_input, user_id, org_id, db)
    if tool_input.get("error"):
        return tool_input
    try:
        return handler(tool_input, effective_user_id, org_id, db)
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
                db, mgr_id, org_id,
                f"Leave request: {leave_type} ({start} → {end}) · {working:.0f} day(s)",
                notification_type="leave_pending",
                title=f"Leave request: {leave_type} ({start} → {end})",
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
    """Mirrors GET /api/v1/leave/my-applications. Includes effective_status and amendment_history."""
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
        app_id = str(d.get("id"))
        for k in ("start_date", "end_date", "created_at", "updated_at", "reviewed_at"):
            if d.get(k) is not None:
                d[k] = str(d[k])
        pending = db.execute(
            text("SELECT id FROM leave_amendment_requests WHERE leave_application_id = :app AND status = 'pending' LIMIT 1"),
            {"app": app_id},
        ).first()
        history = db.execute(
            text("""SELECT status, requested_start_date, requested_end_date, requested_working_days, cancel_leave, reviewed_at, review_comment, created_at
                    FROM leave_amendment_requests WHERE leave_application_id = :app ORDER BY created_at ASC"""),
            {"app": app_id},
        ).mappings().all()
        effective = d.get("status")
        if effective == "approved" and pending:
            effective = "amendment_pending"
        elif effective == "approved" and history and any(h.get("status") == "approved" for h in history):
            effective = "amended"
        d["effective_status"] = effective
        d["amendment_history"] = [dict(h) for h in history]
        for h in d["amendment_history"]:
            for k in list(h):
                if h[k] is not None:
                    h[k] = str(h[k])
        applications.append(d)
    return {
        "applications": applications,
        "note": "To request a change or cancel approved leave, use the Leave page. Approved leave appears on your Calendar.",
    }


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


def _get_employee_profile(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    """Find an employee by name and return their profile. Enforces manager/HR scope."""
    from app.models.user import User
    from app.models.employee_profile import EmployeeProfile

    name_query = (args.get("name") or "").strip().lower()
    if not name_query:
        return {"error": "name is required."}

    # Determine caller role to enforce scope
    caller = db.query(User).filter(User.user_id == user_id).first()
    caller_role = (getattr(caller, "role", "") or "").strip().lower()
    is_hr = caller_role in ("hr_admin", "super_admin")
    is_manager = caller_role == "manager"

    if not is_hr and not is_manager:
        return {"error": "You don't have permission to look up other employees."}

    candidates = (
        db.query(User)
        .filter(User.org_id == org_id, User.is_active == True, User.user_id != user_id)
        .all()
    )

    # Access control: managers can only see their team
    if is_manager and not is_hr:
        from app.services.manager_scope import validate_employee_access
        candidates = [u for u in candidates if validate_employee_access(db, user_id, u.user_id, org_id)]

    # Name matching: first/last/full name
    matched = []
    for u in candidates:
        full_name = (getattr(u, "name", "") or "").strip().lower()
        if name_query in full_name or full_name.startswith(name_query):
            matched.append(u)

    if not matched:
        return {"found": False, "message": f"No employee named '{args.get('name')}' found in your accessible scope."}

    results = []
    for u in matched[:3]:
        profile_row = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == u.user_id).first()
        entry = {
            "user_id":    str(u.user_id),
            "name":       getattr(u, "name", "") or "",
            "email":      getattr(u, "email", "") or "",
            "role":       getattr(u, "role", "") or "",
            "department": getattr(u, "department", "") or "",
            "job_title":  getattr(u, "job_title", "") or "",
            "is_active":  getattr(u, "is_active", True),
        }
        if profile_row:
            entry.update({
                "phone":       getattr(profile_row, "phone", "") or "",
                "location":    getattr(profile_row, "location", "") or "",
                "bio":         (getattr(profile_row, "bio", "") or "")[:300],
                "hire_date":   str(getattr(profile_row, "hire_date", "") or ""),
                "gender":      getattr(profile_row, "gender", "") or "",
                "nationality": getattr(profile_row, "nationality", "") or "",
            })
        # Manager name
        if getattr(u, "manager_id", None):
            mgr = db.query(User).filter(User.user_id == u.manager_id).first()
            entry["reports_to"] = getattr(mgr, "name", "") if mgr else ""
        results.append(entry)

    return {"found": True, "employees": results, "count": len(results)}


def _search_knowledge_base(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    """Search the `documents` table (KB uploads) + `document_chunks` (extracted text)."""
    query = (args.get("query") or "").strip()
    if not query:
        return {"results": [], "error": "Query is required."}

    try:
        rows = db.execute(
            text("""
                SELECT
                    d.id,
                    d.title,
                    d.description,
                    d.category,
                    d.updated_at,
                    (
                        SELECT dc.content
                        FROM document_chunks dc
                        WHERE dc.document_id = d.id
                          AND (
                              to_tsvector('english', dc.content) @@ plainto_tsquery('english', :q)
                              OR dc.content ILIKE :ql
                          )
                        ORDER BY
                            ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', :q)) DESC,
                            dc.chunk_index
                        LIMIT 1
                    ) AS matching_chunk
                FROM documents d
                WHERE d.org_id = :oid
                  AND d.is_current = TRUE
                  AND (
                      to_tsvector('english',
                          COALESCE(d.title, '') || ' ' || COALESCE(d.description, ''))
                      @@ plainto_tsquery('english', :q)
                      OR d.title       ILIKE :ql
                      OR d.description ILIKE :ql
                      OR EXISTS (
                          SELECT 1 FROM document_chunks dc2
                          WHERE dc2.document_id = d.id
                            AND (
                                to_tsvector('english', dc2.content) @@ plainto_tsquery('english', :q)
                                OR dc2.content ILIKE :ql
                            )
                      )
                  )
                ORDER BY
                    ts_rank(
                        to_tsvector('english',
                            COALESCE(d.title, '') || ' ' || COALESCE(d.description, '')),
                        plainto_tsquery('english', :q)
                    ) DESC
                LIMIT 5
            """),
            {"oid": str(org_id), "q": query, "ql": f"%{query}%"},
        ).fetchall()

        results = []
        for r in rows:
            doc_id, title, description, category, updated_at, chunk = r
            snippet = (chunk or description or "")[:500]
            results.append({
                "id":       str(doc_id),
                "title":    title,
                "snippet":  snippet,
                "category": category or "General",
                "updated":  str(updated_at) if updated_at else None,
            })
        return {"results": results, "query": query}

    except Exception as exc:
        logger.warning("search_knowledge_base DB error: %s", exc)
        return {"results": [], "note": "Could not search knowledge base."}


def _search_my_documents(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    """Search the current user's own uploaded documents (employee_documents table)."""
    query = (args.get("query") or "").strip()
    if not query:
        return {"results": [], "error": "Query is required."}

    try:
        from app.models.employee_document import EmployeeDocument

        # Fulltext search on extracted_text + title, falling back to ILIKE
        rows = db.execute(
            text("""
                SELECT id, title, doc_type, original_filename, visibility,
                       extracted_text, created_at
                FROM employee_documents
                WHERE user_id = :uid
                  AND org_id  = :oid
                  AND (
                      (extracted_text IS NOT NULL AND
                       to_tsvector('english', COALESCE(extracted_text,'') || ' ' || COALESCE(title,''))
                       @@ plainto_tsquery('english', :q))
                      OR title          ILIKE :ql
                      OR extracted_text ILIKE :ql
                  )
                ORDER BY
                    ts_rank(
                        to_tsvector('english', COALESCE(extracted_text,'') || ' ' || COALESCE(title,'')),
                        plainto_tsquery('english', :q)
                    ) DESC
                LIMIT 4
            """),
            {"uid": str(user_id), "oid": str(org_id), "q": query, "ql": f"%{query}%"},
        ).fetchall()

        results = []
        for r in rows:
            doc_id, title, doc_type, filename, visibility, extracted_text, created_at = r
            snippet = (extracted_text or "")[:800]
            results.append({
                "id":       str(doc_id),
                "title":    title,
                "doc_type": doc_type,
                "filename": filename,
                "snippet":  snippet,
                "visibility": visibility,
                "uploaded": str(created_at) if created_at else None,
            })

        if not results:
            return {"results": [], "note": f"No personal documents matched '{query}'."}
        return {"results": results, "query": query}

    except Exception as exc:
        logger.warning("search_my_documents DB error: %s", exc)
        return {"results": [], "note": "Could not search personal documents."}


def _get_performance_reviews(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    limit = int(args.get("limit") or 5)
    try:
        rows = db.execute(
            text("""
                SELECT id, review_date, reviewer_id, rating, strengths, areas_for_improvement,
                       goals, overall_comments, status, created_at
                FROM performance_reviews
                WHERE employee_id = :uid
                ORDER BY review_date DESC NULLS LAST, created_at DESC
                LIMIT :lim
            """),
            {"uid": str(user_id), "lim": limit},
        ).fetchall()
        reviews = []
        for r in rows:
            reviews.append({
                "id":                    str(r[0]),
                "review_date":           str(r[1]) if r[1] else None,
                "rating":                r[3],
                "strengths":             r[4] or "",
                "areas_for_improvement": r[5] or "",
                "goals":                 r[6] or "",
                "overall_comments":      r[7] or "",
                "status":                r[8] or "",
            })
        return {"reviews": reviews, "count": len(reviews)}
    except Exception as exc:
        logger.warning("get_performance_reviews error: %s", exc)
        return {"reviews": [], "note": "Could not retrieve performance reviews."}


def _get_announcements(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    limit = int(args.get("limit") or 10)
    try:
        rows = db.execute(
            text("""
                SELECT id, title, content, category, priority, created_at
                FROM announcements
                WHERE org_id = :oid
                  AND (target_roles IS NULL OR target_roles = '{}')
                ORDER BY created_at DESC
                LIMIT :lim
            """),
            {"oid": str(org_id), "lim": limit},
        ).fetchall()
        items = [
            {
                "id":       str(r[0]),
                "title":    r[1],
                "content":  (r[2] or "")[:500],
                "category": r[3] or "general",
                "priority": r[4] or "normal",
                "date":     str(r[5]) if r[5] else None,
            }
            for r in rows
        ]
        return {"announcements": items, "count": len(items)}
    except Exception as exc:
        logger.warning("get_announcements error: %s", exc)
        return {"announcements": [], "note": "Could not retrieve announcements."}


def _get_attendance(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    today = date.today()
    start_str = args.get("start_date") or (today - timedelta(days=7)).isoformat()
    end_str   = args.get("end_date")   or today.isoformat()
    try:
        rows = db.execute(
            text("""
                SELECT id, work_date, clock_in, clock_out, status, hours_worked, notes
                FROM attendance_records
                WHERE user_id = :uid
                  AND work_date BETWEEN :sd AND :ed
                ORDER BY work_date DESC
                LIMIT 30
            """),
            {"uid": str(user_id), "sd": start_str, "ed": end_str},
        ).fetchall()
        records = [
            {
                "date":         str(r[1]),
                "clock_in":     str(r[2]) if r[2] else None,
                "clock_out":    str(r[3]) if r[3] else None,
                "status":       r[4] or "",
                "hours_worked": float(r[5]) if r[5] else None,
                "notes":        r[6] or "",
            }
            for r in rows
        ]
        return {"records": records, "range": {"start": start_str, "end": end_str}}
    except Exception as exc:
        logger.warning("get_attendance error: %s", exc)
        return {"records": [], "note": "Could not retrieve attendance records."}


def _get_payslips(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    limit = int(args.get("limit") or 6)
    try:
        rows = db.execute(
            text("""
                SELECT payslip_id, month, gross_pay, total_deductions, net_pay,
                       status, created_at
                FROM payslips
                WHERE employee_user_id = :uid AND org_id = :oid
                ORDER BY created_at DESC
                LIMIT :lim
            """),
            {"uid": str(user_id), "oid": str(org_id), "lim": limit},
        ).fetchall()
        payslips = [
            {
                "id":               str(r[0]),
                "month":            r[1] or str(r[6])[:7] if r[6] else None,
                "gross_pay":        float(r[2]) if r[2] is not None else None,
                "total_deductions": float(r[3]) if r[3] is not None else None,
                "net_pay":          float(r[4]) if r[4] is not None else None,
                "status":           r[5] or "",
            }
            for r in rows
        ]
        return {"payslips": payslips, "count": len(payslips)}
    except Exception as exc:
        logger.warning("get_payslips error: %s", exc)
        return {"payslips": [], "note": "Could not retrieve payslips."}


def _get_coaching_sessions(args: dict, user_id: UUID, org_id: UUID, db: Session) -> dict:
    limit = int(args.get("limit") or 10)
    try:
        # Try coach_sessions table first, fall back to coaching_sessions
        for table in ("coach_sessions", "coaching_sessions"):
            try:
                rows = db.execute(
                    text(f"""
                        SELECT id, manager_id, employee_name, session_date, concern,
                               outcome, follow_up_date, status
                        FROM {table}
                        WHERE org_id = :oid
                          AND (manager_id = :uid OR employee_member_id = :uid)
                        ORDER BY session_date DESC NULLS LAST
                        LIMIT :lim
                    """),
                    {"oid": str(org_id), "uid": str(user_id), "lim": limit},
                ).fetchall()
                sessions = [
                    {
                        "id":             str(r[0]),
                        "employee_name":  r[2] or "",
                        "session_date":   str(r[3]) if r[3] else None,
                        "concern":        (r[4] or "")[:300],
                        "outcome":        (r[5] or "")[:300],
                        "follow_up_date": str(r[6]) if r[6] else None,
                        "status":         r[7] or "",
                    }
                    for r in rows
                ]
                return {"sessions": sessions, "count": len(sessions)}
            except Exception:
                continue
        return {"sessions": [], "note": "Could not retrieve coaching sessions."}
    except Exception as exc:
        logger.warning("get_coaching_sessions error: %s", exc)
        return {"sessions": [], "note": "Could not retrieve coaching sessions."}
