"""
backend/app/routers/notifications.py
Sprint 5 — Rafiki HR | In-app Notification System

Register in main.py:
    from app.routers.notifications import router as notifications_router
    app.include_router(notifications_router)

Endpoints:
    GET  /api/v1/notifications          — list recent notifications for current user
    POST /api/v1/notifications/mark-read — mark one or all notifications as read
    POST /api/v1/notifications/create   — internal helper (used by other routers to
                                          insert notifications; also callable by
                                          admin/super_admin for manual triggers)

Notification kinds (matches frontend badge colouring):
    timesheet_overdue       — manager: employee has unsubmitted timesheet
    session_reminder        — manager + employee: upcoming 1:1 / coaching (24 h before)
    announcement_unread     — employee: new unread announcement
    guided_path_assigned    — employee: HR assigned a guided path
    coaching_followup_due   — manager: coaching follow-up date reached
    leave_pending           — manager: leave request awaiting approval
"""

import logging
from uuid import UUID, uuid4
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class NotificationOut(BaseModel):
    id: str
    kind: str
    title: str
    body: Optional[str]
    link: Optional[str]
    read_at: Optional[str]
    created_at: str

class MarkReadIn(BaseModel):
    notification_ids: Optional[List[str]] = None   # None = mark ALL unread as read

class CreateNotificationIn(BaseModel):
    user_id: UUID
    org_id: UUID
    kind: str
    title: str
    body: Optional[str] = None
    link: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _insert_notification(db: Session, *, user_id: UUID, org_id: UUID,
                          kind: str, title: str, body: str = None, link: str = None):
    """Low-level insert — call from other routers to fire notifications."""
    db.execute(text("""
        INSERT INTO notifications (id, user_id, org_id, kind, title, body, link, created_at)
        VALUES (:id, :user_id, :org_id, :kind, :title, :body, :link, now())
    """), {
        "id":      str(uuid4()),
        "user_id": str(user_id),
        "org_id":  str(org_id),
        "kind":    kind,
        "title":   title,
        "body":    body,
        "link":    link,
    })
    # Caller is responsible for db.commit()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[NotificationOut])
def list_notifications(
    limit:  int  = Query(default=30, ge=1, le=100),
    unread_only: bool = Query(default=False),
    db:     Session = Depends(get_db),
    user_id: UUID   = Depends(get_current_user_id),
    org_id:  UUID   = Depends(get_current_org_id),
):
    """
    Return the most recent notifications for the current user.
    Ordered newest-first. Use ?unread_only=true to fetch only unread.
    """
    q = """
        SELECT id, kind, title, body, link, read_at, created_at
        FROM notifications
        WHERE user_id = :uid AND org_id = :org
    """
    params = {"uid": str(user_id), "org": str(org_id)}

    if unread_only:
        q += " AND read_at IS NULL"

    q += " ORDER BY created_at DESC LIMIT :limit"
    params["limit"] = limit

    rows = db.execute(text(q), params).mappings().all()

    return [
        NotificationOut(
            id         = str(r["id"]),
            kind       = r["kind"],
            title      = r["title"],
            body       = r["body"],
            link       = r["link"],
            read_at    = r["read_at"].isoformat() if r["read_at"] else None,
            created_at = r["created_at"].isoformat() if r["created_at"] else "",
        )
        for r in rows
    ]


@router.get("/unread-count")
def unread_count(
    db:      Session = Depends(get_db),
    user_id: UUID    = Depends(get_current_user_id),
    org_id:  UUID    = Depends(get_current_org_id),
):
    """Lightweight endpoint polled by the bell badge (no payload, just the count)."""
    count = db.execute(text("""
        SELECT COUNT(*) FROM notifications
        WHERE user_id = :uid AND org_id = :org AND read_at IS NULL
    """), {"uid": str(user_id), "org": str(org_id)}).scalar() or 0

    return {"unread_count": int(count)}


@router.post("/mark-read")
def mark_read(
    body:    MarkReadIn,
    db:      Session = Depends(get_db),
    user_id: UUID    = Depends(get_current_user_id),
    org_id:  UUID    = Depends(get_current_org_id),
):
    """
    Mark notifications as read.
    - Pass notification_ids: [...] to mark specific ones.
    - Pass notification_ids: null (or omit) to mark ALL unread as read.
    """
    now = datetime.now(timezone.utc)

    if body.notification_ids:
        # Binding a Python list through SQLAlchemy text() is unreliable with
        # psycopg2 — construct a safe inline ARRAY literal instead.
        import re
        _uuid_re = re.compile(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            re.IGNORECASE,
        )
        safe_ids = [str(nid) for nid in body.notification_ids
                    if _uuid_re.match(str(nid))]
        if not safe_ids:
            return {"ok": True}
        array_literal = "ARRAY[" + ",".join(f"'{i}'::uuid" for i in safe_ids) + "]"
        db.execute(
            text(f"""
                UPDATE notifications
                SET read_at = :now
                WHERE user_id = :uid
                  AND org_id  = :org
                  AND id      = ANY({array_literal})
                  AND read_at IS NULL
            """),
            {"now": now, "uid": str(user_id), "org": str(org_id)},
        )
    else:
        db.execute(text("""
            UPDATE notifications
            SET read_at = :now
            WHERE user_id = :uid AND org_id = :org AND read_at IS NULL
        """), {"now": now, "uid": str(user_id), "org": str(org_id)})

    db.commit()
    return {"ok": True}


@router.post("/create", status_code=201)
def create_notification(
    payload: CreateNotificationIn,
    db:      Session = Depends(get_db),
    role:    str     = Depends(require_admin),
):
    """
    Manually create a notification (admin/super_admin only).
    Other routers should call _insert_notification() directly.
    """
    _insert_notification(
        db,
        user_id = payload.user_id,
        org_id  = payload.org_id,
        kind    = payload.kind,
        title   = payload.title,
        body    = payload.body,
        link    = payload.link,
    )
    db.commit()
    return {"ok": True}
