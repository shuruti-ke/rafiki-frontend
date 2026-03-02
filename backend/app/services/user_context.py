"""
Rafiki@Work — User Context Aggregator Service

Builds a rich, personalized context about the current user by pulling from:
  - Employee profile (role, department, tenure, manager)
  - Objectives / OKRs + key results
  - Timesheet patterns (projects, time allocation, utilization)
  - Employee documents (contracts, certifications)
  - Knowledge base document chunks matching the query
  - KB category awareness (what docs exist)
  - Interaction memory (topics they frequently ask about)
"""

import logging
from datetime import date, timedelta
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import desc

logger = logging.getLogger(__name__)


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


# ── 2. OBJECTIVES & KEY RESULTS ──

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


# ── 3. TIMESHEET PATTERNS ──

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


# ── 4. EMPLOYEE DOCUMENTS ──

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


# ── 5. KB — RELEVANT DOCUMENTS ──

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


# ── 6. KB CATEGORY AWARENESS ──

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


# ── 7. INTERACTION MEMORY ──

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
# MAIN AGGREGATOR
# ══════════════════════════════════════

def build_user_context(
    db: Session,
    org_id,
    user_id=None,
    user_message: str = "",
) -> str:
    """Build comprehensive personalized context about the current user."""
    sections = []

    if user_id:
        profile = _build_employee_profile(db, org_id, user_id)
        if profile:
            sections.append(profile)

        objectives = _build_objectives_context(db, user_id)
        if objectives:
            sections.append(objectives)

        timesheets = _build_timesheet_context(db, user_id)
        if timesheets:
            sections.append(timesheets)

        emp_docs = _build_employee_docs_context(db, org_id, user_id)
        if emp_docs:
            sections.append(emp_docs)

    kb_relevant = _build_kb_context(db, org_id, user_message)
    if kb_relevant:
        sections.append(kb_relevant)

    kb_categories = _build_kb_categories_context(db, org_id)
    if kb_categories:
        sections.append(kb_categories)

    if user_id and user_message:
        memory = _update_and_build_memory(user_id, user_message)
        if memory:
            sections.append(memory)

    if not sections:
        return ""

    return "\n\n".join(sections)
