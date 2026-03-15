# backend/app/routers/coaching.py
# Sprint 3 — Rafiki HR | Structured coaching sessions CRUD
#
# Registered in main.py as:
#   from app.routers.coaching import router as coaching_router
#   app.include_router(coaching_router)
#
# This router owns /api/v1/coaching/ — separate from the existing AI coaching
# endpoints at /api/v1/manager/coaching (AI generation) and
# /api/v1/manager/coaching/history (legacy sessions) in manager.py.

import uuid
import json
import logging
from datetime import date, datetime, timezone
from typing import List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.dependencies import (
    get_current_user_id,
    get_current_org_id,
    require_manager,
)
from app.models.calendar_event import CalendarEvent
from app.routers.notifications import _insert_notification

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/coaching", tags=["Coaching Sessions"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ActionItem(BaseModel):
    text: str = ""
    due_date: Optional[date] = None
    completed: bool = False

    @field_validator("due_date", mode="before")
    @classmethod
    def empty_date_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v


class CoachingSessionCreate(BaseModel):
    employee_id: uuid.UUID
    concern: str = Field(..., min_length=1, max_length=2000)
    notes: Optional[str] = Field(None, max_length=5000)
    action_items: List[ActionItem] = []
    outcome: Optional[str] = Field(
        None, pattern=r"^(resolved|ongoing|escalated|follow_up)$"
    )
    follow_up_date: Optional[date] = None

    @field_validator("outcome", "notes", mode="before")
    @classmethod
    def empty_str_to_none(cls, v):
        if v == "":
            return None
        return v

    @field_validator("follow_up_date", mode="before")
    @classmethod
    def empty_follow_up_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v


class CoachingSessionUpdate(BaseModel):
    concern: Optional[str] = Field(None, min_length=1, max_length=2000)
    notes: Optional[str] = Field(None, max_length=5000)
    action_items: Optional[List[ActionItem]] = None
    outcome: Optional[str] = Field(
        None, pattern=r"^(resolved|ongoing|escalated|follow_up)$"
    )
    follow_up_date: Optional[date] = None


class CoachingSessionOut(BaseModel):
    """Matches DB row; id may be int (serial) or UUID depending on migration."""
    id: Union[int, uuid.UUID]
    org_id: uuid.UUID
    manager_id: uuid.UUID
    employee_id: uuid.UUID
    concern: str
    notes: Optional[str] = None
    action_items: List[ActionItem] = []
    outcome: Optional[str] = None
    follow_up_date: Optional[date] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _row_to_out(row: dict) -> dict:
    """
    Normalise a raw DB row to CoachingSessionOut shape.
    DB may be AI schema (id int, employee_member_id, manager_notes, outcome_logged)
    or CRUD schema (id uuid, employee_id, notes, outcome). Map both.
    """
    items = row.get("action_items") or []
    if isinstance(items, str):
        try:
            items = json.loads(items)
        except Exception:
            items = []

    return {
        "id": row.get("id"),
        "org_id": row.get("org_id"),
        "manager_id": row.get("manager_id"),
        "employee_id": row.get("employee_id") or row.get("employee_member_id"),
        "concern": row.get("concern", ""),
        "notes": row.get("notes") if row.get("notes") is not None else row.get("manager_notes"),
        "action_items": items,
        "outcome": row.get("outcome") if row.get("outcome") is not None else row.get("outcome_logged"),
        "follow_up_date": row.get("follow_up_date"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at") or row.get("created_at"),
    }


def _parse_session_id(session_id: Union[int, str, uuid.UUID]) -> Union[int, str]:
    """Return value suitable for DB id column (int or UUID string)."""
    if isinstance(session_id, int):
        return session_id
    if isinstance(session_id, uuid.UUID):
        return str(session_id)
    s = str(session_id).strip()
    try:
        return int(s)
    except ValueError:
        return s


def _get_session_or_404(
    session_id: Union[int, str, uuid.UUID],
    manager_id: uuid.UUID,
    org_id: uuid.UUID,
    db: Session,
) -> dict:
    id_param = _parse_session_id(session_id)
    result = db.execute(
        text("""
            SELECT * FROM coaching_sessions
            WHERE id = :id
              AND manager_id = :manager_id
              AND org_id = :org_id
        """),
        {"id": id_param, "manager_id": str(manager_id), "org_id": str(org_id)},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Coaching session not found")
    return _row_to_out(dict(row))


def _parse_date(v) -> Optional[date]:
    """Parse date from string or date object."""
    if v is None:
        return None
    if isinstance(v, date):
        return v
    if isinstance(v, str) and v.strip():
        try:
            return date.fromisoformat(v.strip()[:10])
        except ValueError:
            return None
    return None


def _sync_coaching_to_calendar(
    db: Session,
    org_id: uuid.UUID,
    session_id: Union[int, str],
    manager_id: uuid.UUID,
    employee_id: uuid.UUID,
    action_items: list,
    follow_up_date: Optional[date],
    concern: str,
) -> None:
    """
    Create calendar events for coaching action item due dates and follow-up date
    for both manager and employee. Removes any existing coaching events for this session first.
    """
    sid = str(session_id)
    prefix = f"coaching_{sid}_"

    # Remove existing coaching events for this session
    existing = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.org_id == org_id,
            CalendarEvent.source == "coaching",
            CalendarEvent.external_id.isnot(None),
        )
        .all()
    )
    for ev in existing:
        if ev.external_id and ev.external_id.startswith(prefix):
            db.delete(ev)

    def _make_all_day_range(d: date):
        start = datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=timezone.utc)
        end = datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=timezone.utc)
        return start, end

    def _add_event(owner_id: uuid.UUID, title: str, desc: str, d: date, ext_id: str):
        start, end = _make_all_day_range(d)
        ev = CalendarEvent(
            org_id=org_id,
            user_id=owner_id,
            title=title,
            description=desc,
            start_time=start,
            end_time=end,
            is_all_day=True,
            is_shared=False,
            event_type="coaching",
            color="#8b5cf6",
            source="coaching",
            external_id=ext_id,
        )
        db.add(ev)

    # Action items with due dates
    for i, item in enumerate(action_items or []):
        if not isinstance(item, dict):
            item = item.dict() if hasattr(item, "dict") else {}
        due = _parse_date(item.get("due_date"))
        if not due:
            continue
        text_part = (item.get("text") or "").strip()[:80]
        if len((item.get("text") or "").strip()) > 80:
            text_part += "…"
        title = f"Coaching: {text_part}" if text_part else "Coaching action item"
        ext_id = f"{prefix}action_{i}"
        _add_event(manager_id, title, item.get("text") or "", due, ext_id)
        _add_event(employee_id, title, item.get("text") or "", due, ext_id)

    # Follow-up date
    if follow_up_date:
        concern_short = (concern or "").strip()[:60]
        if len((concern or "").strip()) > 60:
            concern_short += "…"
        title = f"Coaching follow-up: {concern_short}" if concern_short else "Coaching follow-up"
        ext_id = f"{prefix}followup"
        _add_event(manager_id, title, concern or "", follow_up_date, ext_id)
        _add_event(employee_id, title, concern or "", follow_up_date, ext_id)

    try:
        db.commit()
    except Exception as e:
        logger.warning("Coaching calendar sync failed (non-fatal): %s", e)
        db.rollback()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[CoachingSessionOut])
def list_sessions(
    employee_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """
    List coaching sessions for the current manager.
    Pass ?employee_id=<uuid> to filter by employee (used for profile timeline).
    """
    query = """
        SELECT * FROM coaching_sessions
        WHERE manager_id = :manager_id
          AND org_id = :org_id
    """
    params: dict = {"manager_id": str(user_id), "org_id": str(org_id)}

    if employee_id:
        # Table may have employee_id or employee_member_id
        query += " AND (employee_id = :employee_id OR employee_member_id = :employee_id)"
        params["employee_id"] = str(employee_id)

    query += " ORDER BY created_at DESC"

    result = db.execute(text(query), params)
    rows = result.mappings().all()
    return [_row_to_out(dict(r)) for r in rows]


@router.post("/", response_model=CoachingSessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: CoachingSessionCreate,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Create a new structured coaching session.
    Uses columns that exist on coaching_sessions (manager_id, org_id,
    employee_member_id, concern). Id uses DB default (SERIAL or gen_random_uuid()).
    """
    result = db.execute(
        text("""
            INSERT INTO coaching_sessions
              (org_id, manager_id, employee_member_id, concern)
            VALUES
              (:org_id, :manager_id, :employee_member_id, :concern)
            RETURNING id
        """),
        {
            "org_id": str(org_id),
            "manager_id": str(user_id),
            "employee_member_id": str(payload.employee_id),
            "concern": payload.concern,
        },
    )
    db.commit()
    row = result.fetchone()
    session_id = row[0] if row else None

    # ── Sprint 5: remind manager when follow-up date arrives ─────────
    if payload.follow_up_date:
        try:
            _insert_notification(db, user_id=user_id, org_id=org_id,
                kind="coaching_followup_due",
                title=f"Coaching follow-up due {payload.follow_up_date}",
                body=f"Re: {payload.concern[:80]}{'…' if len(payload.concern) > 80 else ''}",
                link="/manager/coaching")
            db.commit()
        except Exception as _e:
            logger.warning(f"Coaching follow-up notification failed (non-fatal): {_e}")
    # ── end Sprint 5 ─────────────────────────────────────────────────

    logger.info(f"Coaching session {session_id} created by manager {user_id}")
    return _get_session_or_404(session_id, user_id, org_id, db)


@router.get("/{session_id}", response_model=CoachingSessionOut)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    return _get_session_or_404(session_id, user_id, org_id, db)


@router.put("/{session_id}", response_model=CoachingSessionOut)
def update_session(
    session_id: str,
    payload: CoachingSessionUpdate,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Partial update — only fields included in the request body are changed."""
    # Verify ownership first
    _get_session_or_404(session_id, user_id, org_id, db)

    updates = payload.dict(exclude_unset=True)
    if not updates:
        return _get_session_or_404(session_id, user_id, org_id, db)

    # Serialise action_items list to JSON string for the JSONB cast
    if "action_items" in updates:
        updates["action_items"] = json.dumps(
            [i.dict() if hasattr(i, "dict") else i for i in updates["action_items"]]
        )

    set_clauses = []
    for k in updates:
        if k == "action_items":
            set_clauses.append("action_items = :action_items::jsonb")
        else:
            set_clauses.append(f"{k} = :{k}")
    set_clauses.append("updated_at = :updated_at")

    params = {k: str(v) if isinstance(v, (uuid.UUID, date, datetime)) else v
              for k, v in updates.items()}
    params["updated_at"] = datetime.utcnow()
    params["id"] = _parse_session_id(session_id)
    params["manager_id"] = str(user_id)
    params["org_id"] = str(org_id)

    db.execute(
        text(f"""
            UPDATE coaching_sessions
            SET {', '.join(set_clauses)}
            WHERE id = :id AND manager_id = :manager_id AND org_id = :org_id
        """),
        params,
    )
    db.commit()

    session_out = _get_session_or_404(session_id, user_id, org_id, db)
    employee_id = session_out.get("employee_id") or session_out.get("employee_member_id")
    if employee_id:
        try:
            emp_uuid = employee_id if isinstance(employee_id, uuid.UUID) else uuid.UUID(str(employee_id))
            _sync_coaching_to_calendar(
                db,
                org_id,
                _parse_session_id(session_id),
                user_id,
                emp_uuid,
                session_out.get("action_items") or [],
                _parse_date(session_out.get("follow_up_date")),
                session_out.get("concern") or "",
            )
        except Exception as e:
            logger.warning("Coaching calendar sync failed (non-fatal): %s", e)

    return session_out


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Delete a coaching session. Only the creating manager can delete."""
    _get_session_or_404(session_id, user_id, org_id, db)

    db.execute(
        text("""
            DELETE FROM coaching_sessions
            WHERE id = :id AND manager_id = :manager_id AND org_id = :org_id
        """),
        {"id": _parse_session_id(session_id), "manager_id": str(user_id), "org_id": str(org_id)},
    )
    db.commit()
    logger.info(f"Coaching session {session_id} deleted by manager {user_id}")
