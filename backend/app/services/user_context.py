"""
Rafiki@Work — User Context Aggregator Service (Intent-Driven)

Two-phase context assembly:
  Phase 1 (always): Lightweight catalog — profile, data inventory, KB categories, memory
  Phase 2 (on-demand): Full data fetched only when user intent matches
"""

import logging
from datetime import date, datetime, timedelta
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import desc, func

logger = logging.getLogger(__name__)


# ══════════════════════════════════════
# INTENT DETECTION
# ══════════════════════════════════════

INTENT_KEYWORDS = {
    "objectives": ["goal", "objective", "okr", "target", "kpi", "progress", "performance review", "key result"],
    "timesheets": ["hours", "timesheet", "time", "utilization", "project", "overtime", "workload", "logged"],
    "documents": ["document", "contract", "certificate", "letter", "file", "upload", "attachment"],
    "payroll": ["salary", "pay", "payslip", "compensation", "bonus", "deduction", "net pay", "gross", "wage"],
    "calendar": ["meeting", "calendar", "schedule", "event", "appointment", "deadline", "tomorrow", "this week", "next week", "today"],
    "announcements": ["announcement", "news", "update", "training", "notice", "policy change", "unread"],
    "performance": ["evaluation", "review", "rating", "strengths", "improvement", "feedback", "appraisal", "performance eval"],
    "guided_paths": ["guided", "module", "wellness", "breathing", "burnout", "stress path", "mindfulness session"],
    "coaching": ["coaching", "report", "team member", "direct report", "mentoring", "one-on-one"],
}

# Default intents loaded when no specific intent is detected
DEFAULT_INTENTS = {"objectives", "calendar"}


def _detect_intents(user_message: str) -> set[str]:
    """Detect which data domains the user is asking about via keyword matching."""
    if not user_message:
        return DEFAULT_INTENTS

    msg_lower = user_message.lower()
    matched = set()
    for intent, keywords in INTENT_KEYWORDS.items():
        if any(kw in msg_lower for kw in keywords):
            matched.add(intent)

    # If nothing specific matched, load sensible defaults
    return matched if matched else DEFAULT_INTENTS


# ══════════════════════════════════════
# PHASE 1: ALWAYS-LOADED CONTEXT
# ══════════════════════════════════════

# ── 1. EMPLOYEE PROFILE ──

def _build_employee_profile(db: Session, org_id, user_id) -> str:
    try:
        from app.models.user import User
        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            return ""

        parts = ["EMPLOYEE PROFILE:"]
        if getattr(user, "full_name", None):
            parts.append(f"  Name: {user.full_name}")
        if getattr(user, "email", None):
            parts.append(f"  Email: {user.email}")
        if getattr(user, "role", None):
            parts.append(f"  Role: {user.role}")
        if getattr(user, "job_title", None):
            parts.append(f"  Job Title: {user.job_title}")
        if getattr(user, "department", None):
            parts.append(f"  Department: {user.department}")
        if getattr(user, "created_at", None):
            try:
                days = (date.today() - user.created_at.date()).days
                if days > 0:
                    parts.append(f"  Tenure: ~{days // 30} months ({days} days)")
            except Exception:
                pass
        if getattr(user, "manager_id", None):
            mgr = db.query(User).filter(User.user_id == user.manager_id).first()
            if mgr:
                parts.append(f"  Reports to: {getattr(mgr, 'full_name', None) or 'their manager'}")

        return "\n".join(parts) if len(parts) > 1 else ""
    except Exception as e:
        logger.debug("Employee profile build skipped: %s", e)
        return ""


# ── 2. DATA INVENTORY (the "catalog card") ──

def _build_data_inventory(db: Session, org_id, user_id) -> str:
    """Quick count queries so Rafiki knows what data exists without loading it."""
    try:
        counts = {}

        # Objectives
        try:
            from app.models.objective import Objective
            counts["Objectives"] = (
                db.query(func.count(Objective.id))
                .filter(Objective.user_id == user_id, Objective.status.in_(["active", "pending_review", "draft"]))
                .scalar() or 0
            )
        except Exception:
            counts["Objectives"] = 0

        # Timesheets (30 days)
        try:
            from app.models.timesheet import TimesheetEntry
            cutoff = date.today() - timedelta(days=30)
            counts["Timesheet entries (30d)"] = (
                db.query(func.count(TimesheetEntry.id))
                .filter(TimesheetEntry.user_id == user_id, TimesheetEntry.date >= cutoff)
                .scalar() or 0
            )
        except Exception:
            counts["Timesheet entries (30d)"] = 0

        # Employee documents
        try:
            from app.models.employee_document import EmployeeDocument
            counts["Documents"] = (
                db.query(func.count(EmployeeDocument.id))
                .filter(EmployeeDocument.user_id == user_id, EmployeeDocument.org_id == org_id)
                .scalar() or 0
            )
        except Exception:
            counts["Documents"] = 0

        # Payslips
        try:
            from app.models.payroll import Payslip
            counts["Payslips"] = (
                db.query(func.count(Payslip.payslip_id))
                .filter(Payslip.employee_user_id == user_id, Payslip.org_id == org_id)
                .scalar() or 0
            )
        except Exception:
            counts["Payslips"] = 0

        # Calendar events (next 7 days)
        try:
            from app.models.calendar_event import CalendarEvent
            now = datetime.utcnow()
            week_out = now + timedelta(days=7)
            counts["Calendar events (7d)"] = (
                db.query(func.count(CalendarEvent.id))
                .filter(
                    CalendarEvent.org_id == org_id,
                    (CalendarEvent.user_id == user_id) | (CalendarEvent.is_shared == True),
                    CalendarEvent.start_time >= now,
                    CalendarEvent.start_time <= week_out,
                )
                .scalar() or 0
            )
        except Exception:
            counts["Calendar events (7d)"] = 0

        # Announcements (unread)
        try:
            from app.models.announcement import Announcement, AnnouncementRead
            from sqlalchemy import and_

            total_active = (
                db.query(func.count(Announcement.id))
                .filter(
                    Announcement.org_id == org_id,
                    Announcement.published_at != None,
                    (Announcement.expires_at == None) | (Announcement.expires_at >= datetime.utcnow()),
                )
                .scalar() or 0
            )
            read_count = (
                db.query(func.count(AnnouncementRead.id))
                .join(Announcement)
                .filter(
                    Announcement.org_id == org_id,
                    AnnouncementRead.user_id == user_id,
                )
                .scalar() or 0
            )
            unread = max(total_active - read_count, 0)
            counts["Announcements"] = f"{unread} unread" if unread else "all read"
        except Exception:
            counts["Announcements"] = 0

        # Performance evaluations
        try:
            from app.models.performance import PerformanceEvaluation
            counts["Evaluations"] = (
                db.query(func.count(PerformanceEvaluation.id))
                .filter(PerformanceEvaluation.user_id == user_id, PerformanceEvaluation.org_id == org_id)
                .scalar() or 0
            )
        except Exception:
            counts["Evaluations"] = 0

        # Guided path sessions
        try:
            import zlib
            from app.models.guided_path import GuidedPathSession
            int_org = zlib.crc32(org_id.bytes) & 0x7FFFFFFF if hasattr(org_id, 'bytes') else int(org_id)
            int_user = zlib.crc32(user_id.bytes) & 0x7FFFFFFF if hasattr(user_id, 'bytes') else int(user_id)
            counts["Guided path sessions"] = (
                db.query(func.count(GuidedPathSession.id))
                .filter(GuidedPathSession.user_id == int_user, GuidedPathSession.org_id == int_org)
                .scalar() or 0
            )
        except Exception:
            counts["Guided path sessions"] = 0

        items = [f"  {k}: {v}" for k, v in counts.items() if v and v != 0]
        if not items:
            return ""

        parts = ["DATA AVAILABLE FOR THIS EMPLOYEE:"]
        parts.extend(items)
        parts.append("  → Ask me about any of these — I can look up the details.")
        return "\n".join(parts)
    except Exception as e:
        logger.debug("Data inventory build skipped: %s", e)
        return ""


# ══════════════════════════════════════
# PHASE 2: ON-DEMAND CONTEXT BUILDERS
# ══════════════════════════════════════

# ── OBJECTIVES & KEY RESULTS ──

def _build_objectives_context(db: Session, user_id) -> str:
    try:
        from app.models.objective import Objective, KeyResult

        objectives = (
            db.query(Objective)
            .filter(Objective.user_id == user_id)
            .filter(Objective.status.in_(["active", "pending_review", "draft"]))
            .order_by(desc(Objective.created_at))
            .limit(10)
            .all()
        )
        if not objectives:
            return ""

        parts = ["CURRENT OBJECTIVES & KEY RESULTS:"]
        for obj in objectives:
            icon = {"active": "●", "pending_review": "◐", "draft": "○"}.get(obj.status, "?")
            parts.append(f"\n  {icon} [{obj.status.upper()}] {obj.title} — {obj.progress}% complete")
            if obj.description:
                parts.append(f"    Description: {obj.description[:200]}")
            if obj.target_date:
                try:
                    days_left = (obj.target_date - date.today()).days
                    parts.append(f"    Target date: {obj.target_date} ({days_left} days remaining)")
                except Exception:
                    parts.append(f"    Target date: {obj.target_date}")

            krs = db.query(KeyResult).filter(KeyResult.objective_id == obj.id).all()
            for kr in krs:
                pct = min(int(kr.current_value / kr.target_value * 100), 100) if kr.target_value else 0
                parts.append(f"    → KR: {kr.title}: {kr.current_value}/{kr.target_value} {kr.unit or ''} ({pct}%)")

        return "\n".join(parts)
    except Exception as e:
        logger.debug("Objectives context build skipped: %s", e)
        return ""


# ── TIMESHEET PATTERNS ──

def _build_timesheet_context(db: Session, user_id) -> str:
    try:
        from app.models.timesheet import TimesheetEntry

        cutoff = date.today() - timedelta(days=30)
        entries = (
            db.query(TimesheetEntry)
            .filter(TimesheetEntry.user_id == user_id, TimesheetEntry.date >= cutoff)
            .all()
        )
        if not entries:
            return ""

        total_hours = sum(float(e.hours) for e in entries)
        unique_dates = set(e.date for e in entries)
        work_days = len(unique_dates)

        by_project = {}
        by_category = {}
        for e in entries:
            by_project[e.project] = by_project.get(e.project, 0) + float(e.hours)
            by_category[e.category] = by_category.get(e.category, 0) + float(e.hours)

        parts = ["RECENT TIMESHEET PATTERNS (last 30 days):"]
        parts.append(f"  Total hours logged: {total_hours:.1f}h across {work_days} days")
        if work_days:
            parts.append(f"  Average daily hours: {total_hours / work_days:.1f}h")
            utilization = min(total_hours / (work_days * 8) * 100, 100)
            parts.append(f"  Utilization rate: {utilization:.0f}%")

        if by_project:
            top = sorted(by_project.items(), key=lambda x: -x[1])[:5]
            parts.append("  Top projects: " + ", ".join(f"{p} ({h:.1f}h)" for p, h in top))

        if by_category:
            top_cats = sorted(by_category.items(), key=lambda x: -x[1])[:5]
            parts.append("  Time allocation: " + ", ".join(f"{c} ({h:.1f}h)" for c, h in top_cats))

            if total_hours > 0:
                meeting_pct = by_category.get("Meetings", 0) / total_hours * 100
                if meeting_pct > 40:
                    parts.append(f"  ⚠ High meeting load ({meeting_pct:.0f}% of time in meetings)")

        return "\n".join(parts)
    except Exception as e:
        logger.debug("Timesheet context build skipped: %s", e)
        return ""


# ── EMPLOYEE DOCUMENTS ──

def _build_employee_docs_context(db: Session, org_id, user_id) -> str:
    try:
        from app.models.employee_document import EmployeeDocument

        docs = (
            db.query(EmployeeDocument)
            .filter(EmployeeDocument.user_id == user_id, EmployeeDocument.org_id == org_id)
            .order_by(desc(EmployeeDocument.created_at))
            .limit(15)
            .all()
        )
        if not docs:
            return ""

        parts = ["EMPLOYEE DOCUMENTS ON FILE:"]
        for d in docs:
            date_str = ""
            if d.created_at:
                try:
                    date_str = f" — uploaded {d.created_at.strftime('%b %d, %Y')}"
                except Exception:
                    pass
            vis = f" ({d.visibility})" if getattr(d, "visibility", None) else ""
            parts.append(f"  • [{d.doc_type}] {d.title} ({d.original_filename}){date_str}{vis}")
        return "\n".join(parts)
    except Exception as e:
        logger.debug("Employee docs context build skipped: %s", e)
        return ""


# ── GUIDED PATHS ──

def _build_guided_paths_context(db: Session, org_id, user_id) -> str:
    try:
        import zlib
        from app.models.guided_path import GuidedModule, GuidedPathSession

        int_org = zlib.crc32(org_id.bytes) & 0x7FFFFFFF if hasattr(org_id, 'bytes') else int(org_id)
        int_user = zlib.crc32(user_id.bytes) & 0x7FFFFFFF if hasattr(user_id, 'bytes') else int(user_id)

        sessions = (
            db.query(GuidedPathSession)
            .filter(GuidedPathSession.user_id == int_user, GuidedPathSession.org_id == int_org)
            .order_by(desc(GuidedPathSession.started_at))
            .limit(5)
            .all()
        )

        modules = (
            db.query(GuidedModule)
            .filter(GuidedModule.is_active == True)
            .filter((GuidedModule.org_id == int_org) | (GuidedModule.org_id.is_(None)))
            .all()
        )

        if not sessions and not modules:
            return ""

        parts = ["GUIDED WELLNESS PATHS:"]

        if sessions:
            mod_ids = list({s.module_id for s in sessions})
            mod_map = {m.id: m for m in db.query(GuidedModule).filter(GuidedModule.id.in_(mod_ids)).all()}

            parts.append("  Recent sessions:")
            for s in sessions:
                mod = mod_map.get(s.module_id)
                mod_name = mod.name if mod else "Unknown module"
                total_steps = len(mod.steps) if mod and mod.steps else "?"
                date_str = s.started_at.strftime('%b %d, %Y') if s.started_at else ""
                rating_str = ""
                if s.pre_rating is not None and s.post_rating is not None:
                    rating_str = f", wellness {s.pre_rating}→{s.post_rating}"
                parts.append(f"    • {mod_name} — {s.status}, step {s.current_step}/{total_steps}{rating_str} ({date_str})")

        if modules:
            parts.append("  Available modules:")
            for m in modules:
                parts.append(f"    • {m.name} ({m.category}, ~{m.duration_minutes}min): {(m.description or '')[:100]}")

        return "\n".join(parts)
    except Exception as e:
        logger.debug("Guided paths context build skipped: %s", e)
        return ""


# ── PAYROLL / PAYSLIPS ──

def _build_payroll_context(db: Session, org_id, user_id) -> str:
    try:
        from app.models.payroll import Payslip, PayrollBatch

        payslips = (
            db.query(Payslip)
            .filter(Payslip.employee_user_id == user_id, Payslip.org_id == org_id)
            .order_by(desc(Payslip.created_at))
            .limit(3)
            .all()
        )
        if not payslips:
            return ""

        # Fetch batch info for period labels
        batch_ids = list({p.batch_id for p in payslips})
        batches = db.query(PayrollBatch).filter(PayrollBatch.batch_id.in_(batch_ids)).all()
        batch_map = {b.batch_id: b for b in batches}

        parts = ["RECENT PAYSLIPS:"]
        for p in payslips:
            batch = batch_map.get(p.batch_id)
            if batch:
                import calendar as cal_mod
                month_name = cal_mod.month_name[batch.period_month]
                period = f"{month_name} {batch.period_year}"
            else:
                period = "Unknown period"
            gross = p.gross_pay
            deductions = p.total_deductions
            net = p.net_pay
            line = f"  • {period}"
            if gross is not None:
                line += f" — Gross: {float(gross):,.2f}"
            if deductions is not None:
                line += f", Deductions: {float(deductions):,.2f}"
            if net is not None:
                line += f", Net: {float(net):,.2f}"
            parts.append(line)
        return "\n".join(parts)
    except Exception as e:
        logger.debug("Payroll context build skipped: %s", e)
        return ""


# ── CALENDAR EVENTS ──

def _build_calendar_context(db: Session, org_id, user_id) -> str:
    try:
        from app.models.calendar_event import CalendarEvent

        now = datetime.utcnow()
        week_out = now + timedelta(days=7)

        events = (
            db.query(CalendarEvent)
            .filter(
                CalendarEvent.org_id == org_id,
                (CalendarEvent.user_id == user_id) | (CalendarEvent.is_shared == True),
                CalendarEvent.start_time >= now,
                CalendarEvent.start_time <= week_out,
            )
            .order_by(CalendarEvent.start_time)
            .limit(15)
            .all()
        )
        if not events:
            return ""

        parts = ["UPCOMING CALENDAR EVENTS (next 7 days):"]
        for ev in events:
            time_str = ev.start_time.strftime("%a %b %d, %H:%M") if ev.start_time else ""
            type_str = f" [{ev.event_type}]" if ev.event_type else ""
            loc = f" @ {ev.location}" if ev.location else ""
            attendee_count = len(ev.attendees) if ev.attendees else 0
            att_str = f" ({attendee_count} attendees)" if attendee_count else ""
            parts.append(f"  • {time_str}{type_str} {ev.title}{loc}{att_str}")
        return "\n".join(parts)
    except Exception as e:
        logger.debug("Calendar context build skipped: %s", e)
        return ""


# ── ANNOUNCEMENTS ──

def _build_announcements_context(db: Session, org_id, user_id) -> str:
    try:
        from app.models.announcement import Announcement, AnnouncementRead, TrainingAssignment

        now = datetime.utcnow()
        announcements = (
            db.query(Announcement)
            .filter(
                Announcement.org_id == org_id,
                Announcement.published_at != None,
                (Announcement.expires_at == None) | (Announcement.expires_at >= now),
            )
            .order_by(desc(Announcement.published_at))
            .limit(10)
            .all()
        )

        # Get user's read IDs
        read_ids = set()
        if announcements:
            reads = (
                db.query(AnnouncementRead.announcement_id)
                .filter(AnnouncementRead.user_id == user_id)
                .all()
            )
            read_ids = {r[0] for r in reads}

        # Training assignments for this user
        training = (
            db.query(TrainingAssignment)
            .filter(TrainingAssignment.user_id == user_id, TrainingAssignment.completed_at == None)
            .all()
        )

        if not announcements and not training:
            return ""

        parts = ["RECENT ANNOUNCEMENTS:"]
        for a in announcements:
            status = "READ" if a.id in read_ids else "UNREAD"
            priority = f" [{a.priority.upper()}]" if a.priority and a.priority != "normal" else ""
            tag = " [TRAINING]" if a.is_training else ""
            date_str = a.published_at.strftime("%b %d") if a.published_at else ""
            parts.append(f"  • ({status}){priority}{tag} {a.title} — {date_str}")
            if a.content:
                parts.append(f"    {a.content[:150]}")

        if training:
            parts.append("\n  PENDING TRAINING ASSIGNMENTS:")
            for t in training:
                ann = db.query(Announcement).filter(Announcement.id == t.announcement_id).first()
                title = ann.title if ann else "Unknown"
                due = f" — due {t.due_date.strftime('%b %d, %Y')}" if t.due_date else ""
                parts.append(f"    • {title}{due}")

        return "\n".join(parts)
    except Exception as e:
        logger.debug("Announcements context build skipped: %s", e)
        return ""


# ── PERFORMANCE EVALUATIONS ──

def _build_performance_context(db: Session, org_id, user_id) -> str:
    try:
        from app.models.performance import PerformanceEvaluation

        evals = (
            db.query(PerformanceEvaluation)
            .filter(PerformanceEvaluation.user_id == user_id, PerformanceEvaluation.org_id == org_id)
            .order_by(desc(PerformanceEvaluation.created_at))
            .limit(3)
            .all()
        )
        if not evals:
            return ""

        parts = ["PERFORMANCE EVALUATIONS:"]
        for ev in evals:
            period = ev.evaluation_period or "Unknown period"
            rating = f" — Rating: {ev.overall_rating}/5" if ev.overall_rating else ""
            parts.append(f"\n  • {period}{rating}")
            if ev.strengths:
                parts.append(f"    Strengths: {ev.strengths[:200]}")
            if ev.areas_for_improvement:
                parts.append(f"    Areas for improvement: {ev.areas_for_improvement[:200]}")
            if ev.goals_for_next_period:
                parts.append(f"    Goals for next period: {ev.goals_for_next_period[:200]}")

        return "\n".join(parts)
    except Exception as e:
        logger.debug("Performance context build skipped: %s", e)
        return ""


# ── COACHING SESSIONS (managers only) ──

def _build_coaching_context(db: Session, org_id, user_id) -> str:
    try:
        from app.models.user import User

        user = db.query(User).filter(User.user_id == user_id).first()
        if not user or user.role not in ("admin", "manager"):
            return ""

        from app.models.toolkit import CoachingSession

        sessions = (
            db.query(CoachingSession)
            .filter(CoachingSession.manager_id == user_id, CoachingSession.org_id == org_id)
            .order_by(desc(CoachingSession.created_at))
            .limit(5)
            .all()
        )
        if not sessions:
            return ""

        parts = ["RECENT COACHING SESSIONS (as manager):"]
        for s in sessions:
            date_str = s.created_at.strftime("%b %d, %Y") if s.created_at else ""
            outcome = f" — Outcome: {s.outcome_logged}" if s.outcome_logged else ""
            parts.append(f"  • {s.employee_name}: {(s.concern or '')[:120]}{outcome} ({date_str})")

        return "\n".join(parts)
    except Exception as e:
        logger.debug("Coaching context build skipped: %s", e)
        return ""


# ══════════════════════════════════════
# KB CONTEXT (always runs, query-dependent)
# ══════════════════════════════════════

def _build_kb_context(db: Session, org_id, user_message: str) -> str:
    if not user_message:
        return ""
    try:
        from app.services.knowledge_search import search_chunks, format_kb_context
        from app.models.document import Document

        chunks = search_chunks(db, org_id, user_message, limit=6)
        if not chunks:
            return ""

        doc_ids = list({c["document_id"] for c in chunks})
        docs = db.query(Document).filter(Document.id.in_(doc_ids)).all()
        doc_map = {d.id: d for d in docs}
        return format_kb_context(chunks, doc_map) or ""
    except Exception as e:
        logger.debug("KB context build skipped: %s", e)
        return ""


def _build_kb_categories_context(db: Session, org_id) -> str:
    try:
        from app.models.document import Document

        docs = (
            db.query(Document.category, Document.title)
            .filter(Document.org_id == org_id, Document.is_current == True)
            .order_by(Document.category, Document.title)
            .all()
        )
        if not docs:
            return ""

        by_cat = {}
        for cat, title in docs:
            by_cat.setdefault(cat, []).append(title)

        parts = ["AVAILABLE KNOWLEDGE BASE DOCUMENTS:"]
        for cat, titles in sorted(by_cat.items()):
            extra = f" (+{len(titles)-8} more)" if len(titles) > 8 else ""
            parts.append(f"  [{cat.upper()}] {', '.join(titles[:8])}{extra}")
        parts.append("  → You can reference these documents by name when answering questions.")
        return "\n".join(parts)
    except Exception as e:
        logger.debug("KB categories context build skipped: %s", e)
        return ""


# ══════════════════════════════════════
# INTERACTION MEMORY
# ══════════════════════════════════════

_user_topic_memory: dict[str, list[str]] = {}

TOPIC_KEYWORDS = {
    "stress": ["stress", "burnout", "overwhelmed", "anxious", "pressure", "exhausted"],
    "workload": ["workload", "too much work", "capacity", "overtime", "hours"],
    "career": ["promotion", "career", "growth", "advancement", "skills", "learning"],
    "relationships": ["conflict", "colleague", "manager", "team", "disagreement", "feedback"],
    "wellbeing": ["health", "sleep", "exercise", "mindfulness", "wellness", "balance"],
    "objectives": ["goal", "objective", "okr", "target", "kpi", "performance"],
    "leave": ["leave", "vacation", "time off", "sick", "holiday", "pto"],
    "payroll": ["salary", "pay", "payslip", "compensation", "bonus", "deduction"],
    "policy": ["policy", "handbook", "procedure", "compliance", "guideline", "rule"],
}


def _detect_topics(message: str) -> list[str]:
    msg_lower = message.lower()
    return [topic for topic, keywords in TOPIC_KEYWORDS.items() if any(kw in msg_lower for kw in keywords)]


def _update_and_build_memory(user_id, user_message: str) -> str:
    uid = str(user_id)
    topics = _detect_topics(user_message)

    if uid not in _user_topic_memory:
        _user_topic_memory[uid] = []
    _user_topic_memory[uid].extend(topics)
    _user_topic_memory[uid] = _user_topic_memory[uid][-50:]

    history = _user_topic_memory[uid]
    if not history:
        return ""

    freq = {}
    for t in history:
        freq[t] = freq.get(t, 0) + 1

    top = sorted(freq.items(), key=lambda x: -x[1])[:5]
    if not top:
        return ""

    parts = ["INTERACTION PATTERNS (topics this employee frequently asks about):"]
    for topic, count in top:
        parts.append(f"  • {topic}: asked about {count} time(s)")

    if any(t in ["stress", "burnout"] for t, _ in top[:2]):
        parts.append("  → This employee may be experiencing ongoing workplace stress. Be especially supportive.")
    if any(t == "career" for t, _ in top[:3]):
        parts.append("  → This employee is actively thinking about career growth. Proactively suggest development resources.")

    return "\n".join(parts)


# ══════════════════════════════════════
# MAIN AGGREGATOR (Intent-Driven)
# ══════════════════════════════════════

def build_user_context(
    db: Session,
    org_id,
    user_id=None,
    user_message: str = "",
) -> str:
    """Build personalized context using intent-driven two-phase assembly."""
    sections = []

    # ── PHASE 1: Always loaded (lightweight catalog) ──
    if user_id:
        profile = _build_employee_profile(db, org_id, user_id)
        if profile:
            sections.append(profile)

        inventory = _build_data_inventory(db, org_id, user_id)
        if inventory:
            sections.append(inventory)

    # KB search (query-dependent, already selective)
    kb_relevant = _build_kb_context(db, org_id, user_message)
    if kb_relevant:
        sections.append(kb_relevant)

    kb_categories = _build_kb_categories_context(db, org_id)
    if kb_categories:
        sections.append(kb_categories)

    # ── PHASE 2: On-demand based on detected intent ──
    if user_id:
        intents = _detect_intents(user_message)
        logger.debug("Detected intents for message: %s → %s", user_message[:80], intents)

        if "objectives" in intents:
            ctx = _build_objectives_context(db, user_id)
            if ctx:
                sections.append(ctx)

        if "timesheets" in intents:
            ctx = _build_timesheet_context(db, user_id)
            if ctx:
                sections.append(ctx)

        if "documents" in intents:
            ctx = _build_employee_docs_context(db, org_id, user_id)
            if ctx:
                sections.append(ctx)

        if "payroll" in intents:
            ctx = _build_payroll_context(db, org_id, user_id)
            if ctx:
                sections.append(ctx)

        if "calendar" in intents:
            ctx = _build_calendar_context(db, org_id, user_id)
            if ctx:
                sections.append(ctx)

        if "announcements" in intents:
            ctx = _build_announcements_context(db, org_id, user_id)
            if ctx:
                sections.append(ctx)

        if "performance" in intents:
            ctx = _build_performance_context(db, org_id, user_id)
            if ctx:
                sections.append(ctx)

        if "guided_paths" in intents:
            ctx = _build_guided_paths_context(db, org_id, user_id)
            if ctx:
                sections.append(ctx)

        if "coaching" in intents:
            ctx = _build_coaching_context(db, org_id, user_id)
            if ctx:
                sections.append(ctx)

    # ── ALWAYS: Interaction memory ──
    if user_id and user_message:
        memory = _update_and_build_memory(user_id, user_message)
        if memory:
            sections.append(memory)

    if not sections:
        return ""

    return "\n\n".join(sections)
