# backend/app/routers/usage.py
"""
Platform usage reporting endpoints.
- GET /api/v1/admin/usage-report  — HR admin: org-wide stats (requires hr_admin or super_admin)
- GET /api/v1/usage/me            — Employee: personal usage stats
Both accept optional ?start=YYYY-MM-DD&end=YYYY-MM-DD query params.
"""
import logging
import uuid
from datetime import datetime, timezone, date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id, get_current_role

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Usage"])

_PRIVILEGED_ROLES = {"hr_admin", "super_admin"}

# ── lazy imports so we don't fail if a model doesn't exist ──
def _import_models():
    from app.models.user import User
    try:
        from app.models.chat_session import ChatSession
    except Exception:
        ChatSession = None
    try:
        from app.models.meeting import Meeting
    except Exception:
        Meeting = None
    try:
        from app.models.employee_document import EmployeeDocument
    except Exception:
        EmployeeDocument = None
    try:
        from app.models.guided_path import GuidedPathSession
    except Exception:
        GuidedPathSession = None
    try:
        from app.models.objective import Objective
    except Exception:
        Objective = None
    try:
        from app.models.timesheet import TimesheetEntry
    except Exception:
        TimesheetEntry = None
    try:
        from app.models.announcement import Announcement, AnnouncementRead
    except Exception:
        Announcement = None
        AnnouncementRead = None
    return {
        "User": User,
        "ChatSession": ChatSession,
        "Meeting": Meeting,
        "EmployeeDocument": EmployeeDocument,
        "GuidedPathSession": GuidedPathSession,
        "Objective": Objective,
        "TimesheetEntry": TimesheetEntry,
        "Announcement": Announcement,
        "AnnouncementRead": AnnouncementRead,
    }


def _parse_dates(start: Optional[str], end: Optional[str]):
    today = date.today()
    if start:
        try:
            start_dt = datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            start_dt = datetime(today.year, today.month, 1, tzinfo=timezone.utc)
    else:
        start_dt = datetime(today.year, today.month, 1, tzinfo=timezone.utc)

    if end:
        try:
            end_dt = datetime.strptime(end, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
        except ValueError:
            end_dt = datetime.now(timezone.utc)
    else:
        end_dt = datetime.now(timezone.utc)

    return start_dt, end_dt


# ── HR Admin: org-wide report ──
@router.get("/api/v1/admin/usage-report")
def admin_usage_report(
    start: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
):
    if role not in _PRIVILEGED_ROLES:
        raise HTTPException(403, "HR Admin access required")

    m = _import_models()
    start_dt, end_dt = _parse_dates(start, end)

    result = {
        "period": {"start": start_dt.date().isoformat(), "end": end_dt.date().isoformat()},
        "org_id": str(org_id),
    }

    # ── Employees ──
    User = m["User"]
    try:
        total_employees = db.query(func.count(User.user_id)).filter(
            User.org_id == org_id, User.is_active == True
        ).scalar() or 0
    except Exception:
        # Fallback: count all users in org
        try:
            total_employees = db.query(func.count(User.user_id)).filter(
                User.org_id == org_id
            ).scalar() or 0
        except Exception:
            total_employees = 0
    result["employees"] = {"total_active": total_employees}

    # ── Chat ──
    ChatSession = m["ChatSession"]
    if ChatSession:
        try:
            total_sessions = db.query(func.count(ChatSession.id)).filter(
                ChatSession.org_id == org_id,
                ChatSession.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            # unique users who chatted
            unique_chatters = db.query(func.count(func.distinct(ChatSession.user_id))).filter(
                ChatSession.org_id == org_id,
                ChatSession.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            result["chat"] = {
                "total_sessions": total_sessions,
                "unique_users": unique_chatters,
                "adoption_rate": round(unique_chatters / total_employees * 100, 1) if total_employees else 0,
            }
        except Exception as e:
            logger.warning("Chat stats error: %s", e)
            result["chat"] = {"total_sessions": 0, "unique_users": 0, "adoption_rate": 0}
    else:
        result["chat"] = {"total_sessions": 0, "unique_users": 0, "adoption_rate": 0}

    # ── Meetings ──
    Meeting = m["Meeting"]
    if Meeting:
        try:
            total_meetings = db.query(func.count(Meeting.id)).filter(
                Meeting.org_id == org_id,
                Meeting.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            completed = db.query(func.count(Meeting.id)).filter(
                Meeting.org_id == org_id,
                Meeting.ended_at.isnot(None),
                Meeting.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            avg_wellbeing = db.query(func.avg(Meeting.wellbeing_rating)).filter(
                Meeting.org_id == org_id,
                Meeting.wellbeing_rating.isnot(None),
                Meeting.created_at.between(start_dt, end_dt),
            ).scalar()
            one_on_ones = db.query(func.count(Meeting.id)).filter(
                Meeting.org_id == org_id,
                Meeting.meeting_type == "one_on_one",
                Meeting.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            result["meetings"] = {
                "total_scheduled": total_meetings,
                "completed": completed,
                "one_on_ones": one_on_ones,
                "group_meetings": total_meetings - one_on_ones,
                "avg_wellbeing_rating": round(float(avg_wellbeing), 1) if avg_wellbeing else None,
            }
        except Exception as e:
            logger.warning("Meeting stats error: %s", e)
            result["meetings"] = {"total_scheduled": 0, "completed": 0}
    else:
        result["meetings"] = {"total_scheduled": 0, "completed": 0}

    # ── Documents ──
    EmployeeDocument = m["EmployeeDocument"]
    if EmployeeDocument:
        try:
            total_docs = db.query(func.count(EmployeeDocument.id)).filter(
                EmployeeDocument.org_id == org_id,
                EmployeeDocument.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            result["documents"] = {"total_uploaded": total_docs}
        except Exception as e:
            logger.warning("Docs stats error: %s", e)
            result["documents"] = {"total_uploaded": 0}
    else:
        result["documents"] = {"total_uploaded": 0}

    # ── Guided Paths ──
    GuidedPathSession = m["GuidedPathSession"]
    if GuidedPathSession:
        try:
            total_gp = db.query(func.count(GuidedPathSession.id)).filter(
                GuidedPathSession.org_id == org_id,
                GuidedPathSession.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            completed_gp = db.query(func.count(GuidedPathSession.id)).filter(
                GuidedPathSession.org_id == org_id,
                GuidedPathSession.status == "completed",
                GuidedPathSession.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            result["guided_paths"] = {
                "total_started": total_gp,
                "completed": completed_gp,
                "completion_rate": round(completed_gp / total_gp * 100, 1) if total_gp else 0,
            }
        except Exception as e:
            logger.warning("Guided path stats error: %s", e)
            result["guided_paths"] = {"total_started": 0, "completed": 0, "completion_rate": 0}
    else:
        result["guided_paths"] = {"total_started": 0, "completed": 0, "completion_rate": 0}

    # ── Objectives ──
    Objective = m["Objective"]
    if Objective:
        try:
            total_obj = db.query(func.count(Objective.id)).filter(
                Objective.org_id == org_id,
                Objective.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            active_obj = db.query(func.count(Objective.id)).filter(
                Objective.org_id == org_id,
                Objective.status == "active",
            ).scalar() or 0
            avg_progress = db.query(func.avg(Objective.progress)).filter(
                Objective.org_id == org_id,
                Objective.status == "active",
            ).scalar()
            by_status = {}
            rows = db.query(Objective.status, func.count(Objective.id)).filter(
                Objective.org_id == org_id
            ).group_by(Objective.status).all()
            for status, count in rows:
                by_status[status] = count
            result["objectives"] = {
                "created_in_period": total_obj,
                "total_active": active_obj,
                "avg_progress": round(float(avg_progress), 1) if avg_progress else 0,
                "by_status": by_status,
            }
        except Exception as e:
            logger.warning("Objectives stats error: %s", e)
            result["objectives"] = {"created_in_period": 0, "total_active": 0, "avg_progress": 0, "by_status": {}}
    else:
        result["objectives"] = {"created_in_period": 0, "total_active": 0, "avg_progress": 0, "by_status": {}}

    # ── Timesheets ──
    TimesheetEntry = m["TimesheetEntry"]
    if TimesheetEntry:
        try:
            total_hours = db.query(func.sum(TimesheetEntry.hours)).filter(
                TimesheetEntry.org_id == org_id,
                TimesheetEntry.date.between(start_dt.date(), end_dt.date()),
            ).scalar() or 0
            submitters = db.query(func.count(func.distinct(TimesheetEntry.user_id))).filter(
                TimesheetEntry.org_id == org_id,
                TimesheetEntry.date.between(start_dt.date(), end_dt.date()),
            ).scalar() or 0
            result["timesheets"] = {
                "total_hours_logged": round(float(total_hours), 1),
                "unique_submitters": submitters,
                "adoption_rate": round(submitters / total_employees * 100, 1) if total_employees else 0,
            }
        except Exception as e:
            logger.warning("Timesheet stats error: %s", e)
            result["timesheets"] = {"total_hours_logged": 0, "unique_submitters": 0, "adoption_rate": 0}
    else:
        result["timesheets"] = {"total_hours_logged": 0, "unique_submitters": 0, "adoption_rate": 0}

    # ── Announcements ──
    Announcement = m["Announcement"]
    AnnouncementRead = m["AnnouncementRead"]
    if Announcement:
        try:
            total_ann = db.query(func.count(Announcement.id)).filter(
                Announcement.org_id == org_id,
                Announcement.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            total_reads = 0
            if AnnouncementRead:
                total_reads = db.query(func.count(AnnouncementRead.id)).filter(
                    AnnouncementRead.org_id == org_id if hasattr(AnnouncementRead, 'org_id') else True,
                    AnnouncementRead.read_at.between(start_dt, end_dt),
                ).scalar() or 0
            result["announcements"] = {
                "total_published": total_ann,
                "total_reads": total_reads,
            }
        except Exception as e:
            logger.warning("Announcement stats error: %s", e)
            result["announcements"] = {"total_published": 0, "total_reads": 0}
    else:
        result["announcements"] = {"total_published": 0, "total_reads": 0}

    # ── Overall engagement score (0-100) ──
    scores = []
    if result["chat"]["adoption_rate"]: scores.append(min(result["chat"]["adoption_rate"], 100))
    if result["timesheets"]["adoption_rate"]: scores.append(min(result["timesheets"]["adoption_rate"], 100))
    if result["guided_paths"]["completion_rate"]: scores.append(min(result["guided_paths"]["completion_rate"], 100))
    if result["objectives"]["avg_progress"]: scores.append(min(result["objectives"]["avg_progress"], 100))
    result["engagement_score"] = round(sum(scores) / len(scores), 1) if scores else 0

    return result


# ── Employee: personal usage ──
@router.get("/api/v1/usage/me")
def my_usage(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    m = _import_models()
    start_dt, end_dt = _parse_dates(start, end)
    result = {
        "period": {"start": start_dt.date().isoformat(), "end": end_dt.date().isoformat()},
    }

    # ── Chat ──
    ChatSession = m["ChatSession"]
    if ChatSession:
        try:
            sessions = db.query(func.count(ChatSession.id)).filter(
                ChatSession.user_id == user_id,
                ChatSession.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            result["chat"] = {"sessions": sessions}
        except Exception:
            result["chat"] = {"sessions": 0}
    else:
        result["chat"] = {"sessions": 0}

    # ── Meetings ──
    Meeting = m["Meeting"]
    if Meeting:
        try:
            hosted = db.query(func.count(Meeting.id)).filter(
                Meeting.host_id == user_id,
                Meeting.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            attended = db.query(func.count(Meeting.id)).filter(
                Meeting.org_id == org_id,
                Meeting.participant_ids.any(str(user_id)),
                Meeting.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            avg_wb = db.query(func.avg(Meeting.wellbeing_rating)).filter(
                Meeting.host_id == user_id,
                Meeting.wellbeing_rating.isnot(None),
            ).scalar()
            result["meetings"] = {
                "hosted": hosted,
                "attended": attended,
                "avg_wellbeing": round(float(avg_wb), 1) if avg_wb else None,
            }
        except Exception:
            result["meetings"] = {"hosted": 0, "attended": 0, "avg_wellbeing": None}
    else:
        result["meetings"] = {"hosted": 0, "attended": 0, "avg_wellbeing": None}

    # ── Documents ──
    EmployeeDocument = m["EmployeeDocument"]
    if EmployeeDocument:
        try:
            docs = db.query(func.count(EmployeeDocument.id)).filter(
                EmployeeDocument.user_id == user_id,
                EmployeeDocument.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            result["documents"] = {"uploaded": docs}
        except Exception:
            result["documents"] = {"uploaded": 0}
    else:
        result["documents"] = {"uploaded": 0}

    # ── Guided Paths ──
    GuidedPathSession = m["GuidedPathSession"]
    if GuidedPathSession:
        try:
            started = db.query(func.count(GuidedPathSession.id)).filter(
                GuidedPathSession.user_id == user_id,
                GuidedPathSession.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            completed = db.query(func.count(GuidedPathSession.id)).filter(
                GuidedPathSession.user_id == user_id,
                GuidedPathSession.status == "completed",
                GuidedPathSession.created_at.between(start_dt, end_dt),
            ).scalar() or 0
            result["guided_paths"] = {
                "started": started,
                "completed": completed,
                "completion_rate": round(completed / started * 100, 1) if started else 0,
            }
        except Exception:
            result["guided_paths"] = {"started": 0, "completed": 0, "completion_rate": 0}
    else:
        result["guided_paths"] = {"started": 0, "completed": 0, "completion_rate": 0}

    # ── Objectives ──
    Objective = m["Objective"]
    if Objective:
        try:
            total = db.query(func.count(Objective.id)).filter(
                Objective.user_id == user_id,
            ).scalar() or 0
            active = db.query(func.count(Objective.id)).filter(
                Objective.user_id == user_id,
                Objective.status == "active",
            ).scalar() or 0
            avg_progress = db.query(func.avg(Objective.progress)).filter(
                Objective.user_id == user_id,
                Objective.status == "active",
            ).scalar()
            result["objectives"] = {
                "total": total,
                "active": active,
                "avg_progress": round(float(avg_progress), 1) if avg_progress else 0,
            }
        except Exception:
            result["objectives"] = {"total": 0, "active": 0, "avg_progress": 0}
    else:
        result["objectives"] = {"total": 0, "active": 0, "avg_progress": 0}

    # ── Timesheets ──
    TimesheetEntry = m["TimesheetEntry"]
    if TimesheetEntry:
        try:
            hours = db.query(func.sum(TimesheetEntry.hours)).filter(
                TimesheetEntry.user_id == user_id,
                TimesheetEntry.date.between(start_dt.date(), end_dt.date()),
            ).scalar() or 0
            result["timesheets"] = {"hours_logged": round(float(hours), 1)}
        except Exception:
            result["timesheets"] = {"hours_logged": 0}
    else:
        result["timesheets"] = {"hours_logged": 0}

    # ── Announcements ──
    AnnouncementRead = m["AnnouncementRead"]
    if AnnouncementRead:
        try:
            reads = db.query(func.count(AnnouncementRead.id)).filter(
                AnnouncementRead.user_id == user_id,
                AnnouncementRead.read_at.between(start_dt, end_dt),
            ).scalar() or 0
            result["announcements"] = {"read": reads}
        except Exception:
            result["announcements"] = {"read": 0}
    else:
        result["announcements"] = {"read": 0}

    return result
