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
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.dependencies import (
    get_current_user_id,
    get_current_org_id,
    require_manager,
)
from app.routers.notifications import _insert_notification

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/coaching", tags=["Coaching Sessions"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ActionItem(BaseModel):
    text: str
    due_date: Optional[date] = None
    completed: bool = False


class CoachingSessionCreate(BaseModel):
    employee_id: uuid.UUID
    concern: str = Field(..., min_length=1, max_length=2000)
    notes: Optional[str] = Field(None, max_length=5000)
    action_items: List[ActionItem] = []
    outcome: Optional[str] = Field(
        None, pattern=r"^(resolved|ongoing|escalated|follow_up)$"
    )
    follow_up_date: Optional[date] = None


class CoachingSessionUpdate(BaseModel):
    concern: Optional[str] = Field(None, min_length=1, max_length=2000)
    notes: Optional[str] = Field(None, max_length=5000)
    action_items: Optional[List[ActionItem]] = None
    outcome: Optional[str] = Field(
        None, pattern=r"^(resolved|ongoing|escalated|follow_up)$"
    )
    follow_up_date: Optional[date] = None


class CoachingSessionOut(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    manager_id: uuid.UUID
    employee_id: uuid.UUID
    concern: str
    notes: Optional[str]
    action_items: List[ActionItem]
    outcome: Optional[str]
    follow_up_date: Optional[date]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _row_to_out(row: dict) -> dict:
    """Normalise a raw DB row — parse action_items JSON if it comes back as string."""
    items = row.get("action_items") or []
    if isinstance(items, str):
        try:
            items = json.loads(items)
        except Exception:
            items = []
    row["action_items"] = items
    return row


def _get_session_or_404(
    session_id: uuid.UUID,
    manager_id: uuid.UUID,
    org_id: uuid.UUID,
    db: Session,
) -> dict:
    result = db.execute(
        text("""
            SELECT * FROM coaching_sessions
            WHERE id = :id
              AND manager_id = :manager_id
              AND org_id = :org_id
        """),
        {"id": str(session_id), "manager_id": str(manager_id), "org_id": str(org_id)},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Coaching session not found")
    return _row_to_out(dict(row))


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
        query += " AND employee_id = :employee_id"
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
    """Create a new structured coaching session."""
    session_id = uuid.uuid4()
    now = datetime.utcnow()
    action_items_json = json.dumps([a.dict() for a in payload.action_items])

    db.execute(
        text("""
            INSERT INTO coaching_sessions
              (id, org_id, manager_id, employee_id, concern, notes,
               action_items, outcome, follow_up_date, created_at, updated_at)
            VALUES
              (:id, :org_id, :manager_id, :employee_id, :concern, :notes,
               :action_items::jsonb, :outcome, :follow_up_date, :created_at, :updated_at)
        """),
        {
            "id": str(session_id),
            "org_id": str(org_id),
            "manager_id": str(user_id),
            "employee_id": str(payload.employee_id),
            "concern": payload.concern,
            "notes": payload.notes,
            "action_items": action_items_json,
            "outcome": payload.outcome,
            "follow_up_date": payload.follow_up_date,
            "created_at": now,
            "updated_at": now,
        },
    )
    db.commit()

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
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    return _get_session_or_404(session_id, user_id, org_id, db)


@router.put("/{session_id}", response_model=CoachingSessionOut)
def update_session(
    session_id: uuid.UUID,
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
    params["id"] = str(session_id)
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

    return _get_session_or_404(session_id, user_id, org_id, db)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: uuid.UUID,
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
        {"id": str(session_id), "manager_id": str(user_id), "org_id": str(org_id)},
    )
    db.commit()
    logger.info(f"Coaching session {session_id} deleted by manager {user_id}")
