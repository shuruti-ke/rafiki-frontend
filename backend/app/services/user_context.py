"""
Rafiki@Work — User Context Aggregator Service (Intent-Driven)

UUID SAFETY:
  All org_id / user_id are native uuid.UUID from FastAPI dependencies.
  _as_uuid() normalises at the entry boundary in build_user_context().
  GuidedPath uses integer FKs (legacy) — zlib CRC32 conversion kept as-is.

DB NOTE:
  users_legacy columns: user_id, org_id, name, email, role, department,
  job_title, manager_id, is_active, created_at, updated_at
  (no 'full_name' column — correct column is 'name')
"""

import logging
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import desc, func

logger = logging.getLogger(__name__)


# ══════════════════════════════════════
# UUID SAFETY HELPER
# ══════════════════════════════════════

def _as_uuid(value) -> uuid.UUID:
    if value is None:
        raise ValueError("Expected UUID, got None")
    if isinstance(value, uuid.UUID):
        return value
    return uuid.UUID(str(value))


# ══════════════════════════════════════
# INTENT DETECTION
# ══════════════════════════════════════

INTENT_KEYWORDS = {
    "objectives": ["goal", "objective", "okr", "target", "kpi", "progress", "performance review", "key result"],
    "timesheets": ["hours", "timesheet", "time", "utilization", "project", "overtime", "workload", "logged"],
    "documents": [
        "document", "contract", "certificate", "letter", "file", "upload", "attachment",
        "offer letter", "employment", "agreement", "nda", "policy", "handbook",
        "job description", "appraisal", "payslip doc", "tax", "id", "passport",
        "read", "show me", "open", "summarize", "what does", "what is in",
        "tell me about", "check my", "look at my", "review my",
    ],
    "payroll": ["salary", "pay", "payslip", "compensation", "bonus", "deduction", "net pay", "gross", "wage"],
    "calendar": ["meeting", "calendar", "schedule", "event", "appointment", "deadline", "tomorrow", "this week", "next week", "today"],
    "announcements": ["announcement", "news", "update", "training", "notice", "policy change", "unread"],
    "performance": ["evaluation", "review", "rating", "strengths", "improvement", "feedback", "appraisal", "performance eval"],
    "guided_paths": ["guided", "module", "wellness", "breathing", "burnout", "stress path", "mindfulness session"],
    "coaching": ["coaching", "report", "team member", "direct report", "mentoring", "one-on-one",
                 "my team", "who do i manage", "managing", "people i manage", "my staff",
                 "my reports", "subordinate", "reportee"],
    "web_search": [
        "hotel", "hotels", "restaurant", "restaurants", "flight", "flights",
        "price", "prices", "cost", "how much", "where can i", "recommend",
        "book", "booking", "nearby", "location", "directions", "weather",
        "news", "latest", "current", "today's", "search for", "look up",
        "find me", "what is the", "who is", "compare", "best",
        "shop", "buy", "store", "market", "rate", "exchange rate",
    ],
}

DEFAULT_INTENTS = {"objectives", "calendar"}

_DOC_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv"}


def _detect_intents(user_message: str, user_doc_titles: list[str] = None) -> set[str]:
    msg_lower = (user_message or "").lower()
    matched = set()

    for intent, keywords in INTENT_KEYWORDS.items():
        if any(kw in msg_lower for kw in keywords):
            matched.add(intent)

    if any(ext in msg_lower for ext in _DOC_EXTENSIONS):
        matched.add("documents")

    if user_doc_titles:
        # Match by known filename/title in message
        for title in user_doc_titles:
            if title and title.lower() in msg_lower:
                matched.add("documents")
                break
        # Always include documents when user has docs on file —
        # vague messages like "tell me about eunice" still need the doc index
        matched.add("documents")

    return matched if matched else DEFAULT_INTENTS


# ══════════════════════════════════════
# PHASE 1: ALWAYS-LOADED CONTEXT
# ══════════════════════════════════════

def _build_employee_profile(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> str:
    try:
        from app.models.user import User
        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            return ""

        parts = ["EMPLOYEE PROFILE:"]
        # DB column is 'name' (not 'full_name')
        if getattr(user, "name", None):
            parts.append(f"  Name: {user.name}")
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
            try:
                mgr_uuid = _as_uuid(user.manager_id)
                mgr = db.query(User).filter(User.user_id == mgr_uuid).first()
                if mgr:
                    parts.append(f"  Reports to: {getattr(mgr, 'name', None) or 'their manager'}")
            except Exception:
                pass

        # Direct reports — anyone whose manager_id == this user
        try:
            reports = (
                db.query(User)
                .filter(User.manager_id == user_id, User.org_id == org_id, User.is_active == True)
                .order_by(User.name)
                .all()
            )
            if reports:
                names = [getattr(r, "name", None) or getattr(r, "email", "Unknown") for r in reports]
                parts.append(f"  Direct reports ({len(reports)}): {', '.join(names)}")
            else:
                parts.append("  Direct reports: None")
        except Exception as _dr_err:
            logger.warning("Direct reports query failed for user %s: %s", user_id, _dr_err)

        return "\n".join(parts) if len(parts) > 1 else ""
    except Exception as e:
        logger.debug("Employee profile build skipped: %s", e)
        return ""


def _build_data_inventory(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> str:
    try:
        counts = {}

        try:
            from app.models.objective import Objective
            counts["Objectives"] = (
                db.query(func.count(Objective.id))
                .filter(Objective.user_id == user_id, Objective.status.in_(["active", "pending_review", "draft"]))
                .scalar() or 0
            )
        except Exception:
            db.rollback()
            counts["Objectives"] = 0

        try:
            from app.models.timesheet import TimesheetEntry
            cutoff = date.today() - timedelta(days=30)
            counts["Timesheet entries (30d)"] = (
                db.query(func.count(TimesheetEntry.id))
                .filter(TimesheetEntry.user_id == user_id, TimesheetEntry.date >= cutoff)
                .scalar() or 0
            )
        except Exception:
            db.rollback()
            counts["Timesheet entries (30d)"] = 0

        try:
            from app.models.employee_document import EmployeeDocument
            counts["Documents"] = (
                db.query(func.count(EmployeeDocument.id))
                .filter(EmployeeDocument.user_id == user_id, EmployeeDocument.org_id == org_id)
                .scalar() or 0
            )
        except Exception:
            db.rollback()
            counts["Documents"] = 0

        try:
            from app.models.payroll import Payslip
            counts["Payslips"] = (
                db.query(func.count(Payslip.payslip_id))
                .filter(Payslip.employee_user_id == user_id, Payslip.org_id == org_id)
                .scalar() or 0
            )
        except Exception:
            db.rollback()
            counts["Payslips"] = 0

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
            db.rollback()
            counts["Calendar events (7d)"] = 0

        try:
            from app.models.announcement import Announcement, AnnouncementRead
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
            db.rollback()
            counts["Announcements"] = 0

        try:
            from app.models.performance import PerformanceEvaluation
            counts["Evaluations"] = (
                db.query(func.count(PerformanceEvaluation.id))
                .filter(PerformanceEvaluation.user_id == user_id, PerformanceEvaluation.org_id == org_id)
                .scalar() or 0
            )
        except Exception:
            db.rollback()
            counts["Evaluations"] = 0

        try:
            import zlib
            from app.models.guided_path import GuidedPathSession
            int_org = zlib.crc32(org_id.bytes) & 0x7FFFFFFF
            int_user = zlib.crc32(user_id.bytes) & 0x7FFFFFFF
            counts["Guided path sessions"] = (
                db.query(func.count(GuidedPathSession.id))
                .filter(GuidedPathSession.user_id == int_user, GuidedPathSession.org_id == int_org)
                .scalar() or 0
            )
        except Exception:
            db.rollback()
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

def _build_objectives_context(db: Session, user_id: uuid.UUID) -> str:
    try:
        from app.models.objective import Objective, KeyResult

        objectives = (
            db.query(Objective)
            .filter(Objective.user_id == user_id, Objective.status.in_(["active", "pending_review", "draft"]))
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


def _build_timesheet_context(db: Session, user_id: uuid.UUID) -> str:
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


def _build_employee_docs_context(
    db: Session,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    user_message: str = "",
) -> str:
    """Every user sees their OWN documents — no role restriction."""
    try:
        from app.models.employee_document import EmployeeDocument

        docs = (
            db.query(EmployeeDocument)
            .filter(
                EmployeeDocument.user_id == user_id,
                EmployeeDocument.org_id == org_id,
            )
            .order_by(desc(EmployeeDocument.created_at))
            .limit(20)
            .all()
        )
        if not docs:
            return ""

        msg_lower = user_message.lower()

        def _score(doc) -> int:
            score = 0
            name_lower = (doc.original_filename or "").lower().replace(".pdf", "").replace("_", " ")
            title_lower = (doc.title or "").lower()
            dtype_lower = (doc.doc_type or "").lower()
            if name_lower and name_lower in msg_lower:
                score += 10
            if title_lower and title_lower in msg_lower:
                score += 10
            if dtype_lower and dtype_lower in msg_lower:
                score += 5
            return score

        scored = sorted(docs, key=_score, reverse=True)
        has_specific_match = _score(scored[0]) >= 5 if scored else False

        parts = ["EMPLOYEE DOCUMENTS ON FILE:"]
        for d in docs:
            date_str = ""
            if d.created_at:
                try:
                    date_str = f" — uploaded {d.created_at.strftime('%b %d, %Y')}"
                except Exception:
                    pass
            has_text = " ✓" if d.extracted_text else " (no text extracted)"
            vis = f" [{d.visibility}]" if getattr(d, "visibility", None) else ""
            parts.append(f"  • [{d.doc_type}] {d.title} ({d.original_filename}){date_str}{vis}{has_text}")

        MAX_CHARS_PER_DOC = 5_000
        MAX_TOTAL_CHARS = 15_000
        total_chars = 0
        content_parts = []

        candidates = [d for d in scored if _score(d) >= 5][:3] if has_specific_match else [d for d in scored if d.extracted_text][:3]

        for doc in candidates:
            if not doc.extracted_text:
                continue
            if total_chars >= MAX_TOTAL_CHARS:
                break
            snippet = doc.extracted_text[:MAX_CHARS_PER_DOC]
            total_chars += len(snippet)
            truncated = len(doc.extracted_text) > MAX_CHARS_PER_DOC
            content_parts.append(
                f"\n  ── DOCUMENT CONTENT: {doc.title or doc.original_filename} ──"
                f"\n  Type: {doc.doc_type} | File: {doc.original_filename}"
                f"\n{snippet}"
                + ("\n  [...document truncated...]" if truncated else "")
            )

        if content_parts:
            parts.append("\nDOCUMENT CONTENTS (read and answer directly from this text):")
            parts.extend(content_parts)

        return "\n".join(parts)
    except Exception as e:
        logger.debug("Employee docs context build skipped: %s", e)
        return ""


def _build_guided_paths_context(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> str:
    try:
        import zlib
        from app.models.guided_path import GuidedModule, GuidedPathSession

        int_org = zlib.crc32(org_id.bytes) & 0x7FFFFFFF
        int_user = zlib.crc32(user_id.bytes) & 0x7FFFFFFF

        sessions = (
            db.query(GuidedPathSession)
            .filter(GuidedPathSession.user_id == int_user, GuidedPathSession.org_id == int_org)
            .order_by(desc(GuidedPathSession.started_at))
            .limit(5)
            .all()
        )
        modules = (
            db.query(GuidedModule)
            .filter(GuidedModule.is_active == True, (GuidedModule.org_id == int_org) | (GuidedModule.org_id.is_(None)))
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
                rating_str = f", wellness {s.pre_rating}→{s.post_rating}" if s.pre_rating is not None and s.post_rating is not None else ""
                parts.append(f"    • {mod_name} — {s.status}, step {s.current_step}/{total_steps}{rating_str} ({date_str})")
        if modules:
            parts.append("  Available modules:")
            for m in modules:
                parts.append(f"    • {m.name} ({m.category}, ~{m.duration_minutes}min): {(m.description or '')[:100]}")

        return "\n".join(parts)
    except Exception as e:
        logger.debug("Guided paths context build skipped: %s", e)
        return ""


def _build_payroll_context(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> str:
    try:
        from app.models.payroll import Payslip, PayrollBatch
        from app.models.employee_document import EmployeeDocument

        payslips = (
            db.query(Payslip)
            .filter(Payslip.employee_user_id == user_id, Payslip.org_id == org_id)
            .order_by(desc(Payslip.created_at))
            .limit(3)
            .all()
        )
        if not payslips:
            return ""

        batch_ids = list({p.batch_id for p in payslips})
        batches = db.query(PayrollBatch).filter(PayrollBatch.batch_id.in_(batch_ids)).all()
        batch_map = {b.batch_id: b for b in batches}

        # Fetch linked documents for full payslip content
        doc_ids = [p.document_id for p in payslips if p.document_id]
        doc_map = {}
        if doc_ids:
            docs = db.query(EmployeeDocument).filter(EmployeeDocument.id.in_(doc_ids)).all()
            doc_map = {d.id: d for d in docs}

        parts = ["RECENT PAYSLIPS:"]
        parts.append("  (ONLY quote figures that appear below. If a breakdown is not shown, say so.)")
        for p in payslips:
            batch = batch_map.get(p.batch_id)
            if batch:
                import calendar as cal_mod
                period = f"{cal_mod.month_name[batch.period_month]} {batch.period_year}"
            else:
                period = "Unknown period"
            line = f"  • {period}"
            if p.gross_pay is not None:
                line += f" — Gross: {float(p.gross_pay):,.2f}"
            if p.total_deductions is not None:
                line += f", Deductions: {float(p.total_deductions):,.2f}"
            if p.net_pay is not None:
                line += f", Net: {float(p.net_pay):,.2f}"
            parts.append(line)

            # Include the actual payslip document text if available
            doc = doc_map.get(p.document_id)
            if doc and doc.extracted_text:
                snippet = doc.extracted_text[:6000]
                truncated = len(doc.extracted_text) > 6000
                parts.append(f"\n  ── PAYSLIP DOCUMENT CONTENT ({period}) ──")
                parts.append(snippet)
                if truncated:
                    parts.append("  [...document truncated...]")

        return "\n".join(parts)
    except Exception as e:
        logger.debug("Payroll context build skipped: %s", e)
        return ""


def _build_calendar_context(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> str:
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
            att_str = f" ({len(ev.attendees)} attendees)" if ev.attendees else ""
            parts.append(f"  • {time_str}{type_str} {ev.title}{loc}{att_str}")
        return "\n".join(parts)
    except Exception as e:
        logger.debug("Calendar context build skipped: %s", e)
        return ""


def _build_announcements_context(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> str:
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

        read_ids = set()
        if announcements:
            reads = db.query(AnnouncementRead.announcement_id).filter(AnnouncementRead.user_id == user_id).all()
            read_ids = {r[0] for r in reads}

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


def _build_performance_context(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> str:
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


def _build_coaching_context(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> str:
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
# KB CONTEXT — available to ALL users
# ══════════════════════════════════════

def _build_kb_context(db: Session, org_id: uuid.UUID, user_message: str) -> str:
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


def _build_kb_categories_context(db: Session, org_id: uuid.UUID) -> str:
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
    return [t for t, kws in TOPIC_KEYWORDS.items() if any(kw in msg_lower for kw in kws)]


def _update_and_build_memory(user_id: uuid.UUID, user_message: str) -> str:
    uid = str(user_id)
    topics = _detect_topics(user_message)

    if uid not in _user_topic_memory:
        _user_topic_memory[uid] = []
    _user_topic_memory[uid].extend(topics)
    _user_topic_memory[uid] = _user_topic_memory[uid][-50:]

    history = _user_topic_memory[uid]
    if not history:
        return ""

    freq: dict[str, int] = {}
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
# HELPER: doc titles for intent detection
# ══════════════════════════════════════

def _get_user_doc_titles(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> list[str]:
    try:
        from app.models.employee_document import EmployeeDocument
        rows = (
            db.query(EmployeeDocument.title, EmployeeDocument.original_filename)
            .filter(EmployeeDocument.user_id == user_id, EmployeeDocument.org_id == org_id)
            .limit(50)
            .all()
        )
        titles = []
        for title, filename in rows:
            if title:
                titles.append(title.lower())
            if filename:
                titles.append(filename.lower())
                titles.append(filename.lower().rsplit(".", 1)[0])
        return titles
    except Exception:
        return []


# ══════════════════════════════════════
# MAIN AGGREGATOR
# ══════════════════════════════════════

def _get_direct_reports(db: Session, org_id: uuid.UUID, manager_id: uuid.UUID) -> list:
    """Return active direct reports for a manager. Used for both context and security checks."""
    try:
        from app.models.user import User
        return (
            db.query(User)
            .filter(
                User.manager_id == manager_id,
                User.org_id == org_id,
                User.is_active == True,
            )
            .all()
        )
    except Exception as e:
        logger.warning("_get_direct_reports failed: %s", e)
        return []


def _build_direct_report_context(
    db: Session,
    org_id: uuid.UUID,
    manager_id: uuid.UUID,
    user_message: str,
    chat_history: list[dict] | None = None,
) -> str:
    """
    When a manager's message (or recent history) mentions a direct report by
    name, load that person's summary into context.

    Security: only loads data for users whose manager_id == manager_id AND
    org_id matches. Employees outside this manager's direct reports are
    never surfaced.
    """
    try:
        reports = _get_direct_reports(db, org_id, manager_id)
        if not reports:
            return ""

        # Build a single search string from current message + last 6 history turns
        search_text = user_message.lower()
        if chat_history:
            for turn in chat_history[-6:]:
                search_text += " " + (turn.get("content") or "").lower()

        # Find which report(s) are mentioned
        matched = []
        for r in reports:
            name = getattr(r, "name", "") or ""
            name_parts = [p.lower() for p in name.split() if len(p) > 2]
            if name.lower() in search_text or any(p in search_text for p in name_parts):
                matched.append(r)

        if not matched:
            return ""

        sections = []
        for report in matched[:2]:  # cap at 2 to keep context size reasonable
            report_uuid = _as_uuid(report.user_id)
            parts = [f"DIRECT REPORT PROFILE — {report.name or report.email}:"]
            if report.job_title:
                parts.append(f"  Job Title: {report.job_title}")
            if report.department:
                parts.append(f"  Department: {report.department}")
            if report.created_at:
                try:
                    days = (date.today() - report.created_at.date()).days
                    parts.append(f"  Tenure: ~{days // 30} months")
                except Exception:
                    pass

            # Objectives
            try:
                from app.models.objective import Objective, KeyResult
                objectives = (
                    db.query(Objective)
                    .filter(
                        Objective.user_id == report_uuid,
                        Objective.status.in_(["active", "pending_review", "draft"]),
                    )
                    .order_by(desc(Objective.created_at))
                    .limit(5)
                    .all()
                )
                if objectives:
                    parts.append("  Objectives:")
                    for obj in objectives:
                        icon = {"active": "●", "pending_review": "◐", "draft": "○"}.get(obj.status, "?")
                        parts.append(f"    {icon} {obj.title} — {obj.progress}% complete")
                        if obj.target_date:
                            try:
                                days_left = (obj.target_date - date.today()).days
                                parts.append(f"      Due: {obj.target_date} ({days_left}d remaining)")
                            except Exception:
                                pass
                        krs = db.query(KeyResult).filter(KeyResult.objective_id == obj.id).all()
                        for kr in krs:
                            pct = min(int(kr.current_value / kr.target_value * 100), 100) if kr.target_value else 0
                            parts.append(f"      → {kr.title}: {kr.current_value}/{kr.target_value} {kr.unit or ''} ({pct}%)")
                else:
                    parts.append("  Objectives: None on record")
            except Exception as e:
                logger.debug("Direct report objectives failed: %s", e)

            # Timesheet — last 30 days
            try:
                from app.models.timesheet import TimesheetEntry
                cutoff = date.today() - timedelta(days=30)
                entries = (
                    db.query(TimesheetEntry)
                    .filter(
                        TimesheetEntry.user_id == report_uuid,
                        TimesheetEntry.date >= cutoff,
                    )
                    .all()
                )
                if entries:
                    total_h = sum(float(e.hours) for e in entries)
                    work_days = len(set(e.date for e in entries))
                    submitted = sum(1 for e in entries if e.status in ("submitted", "approved"))
                    draft = sum(1 for e in entries if e.status == "draft")
                    parts.append(f"  Timesheet (last 30d): {total_h:.1f}h across {work_days} days")
                    if draft:
                        parts.append(f"    ⚠ {draft} draft entries not yet submitted")
                    by_project = {}
                    for e in entries:
                        by_project[e.project] = by_project.get(e.project, 0) + float(e.hours)
                    top = sorted(by_project.items(), key=lambda x: -x[1])[:3]
                    parts.append("    Top projects: " + ", ".join(f"{p} ({h:.1f}h)" for p, h in top))
                else:
                    parts.append("  Timesheet (last 30d): No entries logged")
            except Exception as e:
                logger.debug("Direct report timesheet failed: %s", e)

            # Leave balance
            try:
                from sqlalchemy import text as _text
                bal_rows = db.execute(
                    _text("""
                        SELECT leave_type, entitled_days, used_days, carried_over_days
                        FROM leave_balances
                        WHERE user_id = :uid AND leave_year = :yr
                        ORDER BY leave_type
                    """),
                    {"uid": str(report_uuid), "yr": date.today().year},
                ).mappings().all()
                if bal_rows:
                    parts.append("  Leave balances (this year):")
                    for b in bal_rows:
                        available = float(b["entitled_days"]) + float(b["carried_over_days"]) - float(b["used_days"])
                        parts.append(f"    {b['leave_type']}: {max(0, available):.1f} days remaining")
            except Exception as e:
                logger.debug("Direct report leave balance failed: %s", e)

            sections.append("\n".join(parts))

        return "\n\n".join(sections)

    except Exception as e:
        logger.warning("_build_direct_report_context failed: %s", e)
        return ""



def build_user_context(
    db: Session,
    org_id,
    user_id=None,
    user_message: str = "",
    chat_history: list[dict] | None = None,
) -> str:
    """
    Entry point. Coerces org_id and user_id to native uuid.UUID immediately.
    All users get their own docs + org KB + objectives etc. (intent-driven).
    chat_history is a list of {"role": ..., "content": ...} dicts from the
    conversation, used to enrich web search queries with prior context.
    """
    try:
        org_uuid = _as_uuid(org_id)
    except Exception as e:
        logger.error("build_user_context: invalid org_id=%r — %s", org_id, e)
        return ""

    # Clear any aborted transaction left by previous queries on this session
    # (e.g. from FastAPI dependencies or earlier middleware). All context
    # builders are read-only so a rollback here is always safe.
    try:
        db.rollback()
    except Exception:
        pass

    user_uuid: uuid.UUID | None = None
    if user_id is not None:
        try:
            user_uuid = _as_uuid(user_id)
        except Exception as e:
            logger.error("build_user_context: invalid user_id=%r — %s", user_id, e)
            return ""

    sections = []

    # ── PHASE 1: Always loaded ──
    if user_uuid:
        profile = _build_employee_profile(db, org_uuid, user_uuid)
        if profile:
            sections.append(profile)

        inventory = _build_data_inventory(db, org_uuid, user_uuid)
        if inventory:
            sections.append(inventory)

    kb_relevant = _build_kb_context(db, org_uuid, user_message)
    if kb_relevant:
        sections.append(kb_relevant)

    kb_categories = _build_kb_categories_context(db, org_uuid)
    if kb_categories:
        sections.append(kb_categories)

    # ── PHASE 2: On-demand ──
    if user_uuid:
        doc_titles = _get_user_doc_titles(db, org_uuid, user_uuid)
        intents = _detect_intents(user_message, user_doc_titles=doc_titles)
        logger.debug("Detected intents for '%s': %s", user_message[:80], intents)

        if "objectives" in intents:
            ctx = _build_objectives_context(db, user_uuid)
            if ctx:
                sections.append(ctx)

        if "timesheets" in intents:
            ctx = _build_timesheet_context(db, user_uuid)
            if ctx:
                sections.append(ctx)

        if "documents" in intents:
            ctx = _build_employee_docs_context(db, org_uuid, user_uuid, user_message)
            if ctx:
                sections.append(ctx)

        if "payroll" in intents:
            ctx = _build_payroll_context(db, org_uuid, user_uuid)
            if ctx:
                sections.append(ctx)

        if "calendar" in intents:
            ctx = _build_calendar_context(db, org_uuid, user_uuid)
            if ctx:
                sections.append(ctx)

        if "announcements" in intents:
            ctx = _build_announcements_context(db, org_uuid, user_uuid)
            if ctx:
                sections.append(ctx)

        if "performance" in intents:
            ctx = _build_performance_context(db, org_uuid, user_uuid)
            if ctx:
                sections.append(ctx)

        if "guided_paths" in intents:
            ctx = _build_guided_paths_context(db, org_uuid, user_uuid)
            if ctx:
                sections.append(ctx)

        if "coaching" in intents:
            ctx = _build_coaching_context(db, org_uuid, user_uuid)
            if ctx:
                sections.append(ctx)

        # Direct report lookup — triggered whenever message names a report.
        # Also scans recent chat history so follow-up turns like "tell me about
        # thomas" work even when the name only appeared in a prior turn.
        # Security: only loads data for confirmed direct reports (manager_id == user_uuid).
        if user_message:
            ctx = _build_direct_report_context(
                db, org_uuid, user_uuid, user_message, chat_history=chat_history
            )
            if ctx:
                sections.append(ctx)



    if user_uuid and user_message:
        memory = _update_and_build_memory(user_uuid, user_message)
        if memory:
            sections.append(memory)

    return "\n\n".join(sections) if sections else ""

