"""
Notifications router — provides /unread-count, list, and mark-read.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id
from app.models.message import DmConversation, DmMessage, ConversationParticipant
from app.models.notification import Notification


def _insert_notification(
    db: Any,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    content: str,
    notification_type: Optional[str] = None,
    **kwargs: Any,
) -> None:
    """Insert a notification row. Caller is responsible for db.commit()."""
    title = kwargs.get("title") or (content[:80] + ("…" if len(content) > 80 else ""))
    notif = Notification(
        user_id=user_id,
        org_id=org_id,
        kind=notification_type or "general",
        title=title,
        body=content,
        link=kwargs.get("link"),
    )
    db.add(notif)


router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


class MarkReadBody(BaseModel):
    notification_ids: Optional[list[uuid.UUID]] = None  # None = mark all


@router.get("")
def list_notifications(
    limit: int = Query(40, ge=1, le=100),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.org_id == org_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )


@router.post("/mark-read")
def mark_read(
    body: MarkReadBody,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    q = db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.org_id == org_id,
        Notification.read_at == None,
    )
    if body.notification_ids:
        q = q.filter(Notification.id.in_(body.notification_ids))
    q.update({"read_at": datetime.now(timezone.utc)}, synchronize_session=False)
    db.commit()
    return {"ok": True}


@router.get("/unread-count")
def get_unread_count(
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Return total unread count: DMs + notifications."""
    # DM unread count
    convo_ids = (
        db.query(ConversationParticipant.conversation_id)
        .filter(ConversationParticipant.user_id == user_id)
    )
    convos = (
        db.query(DmConversation)
        .filter(DmConversation.id.in_(convo_ids), DmConversation.org_id == org_id)
        .all()
    )
    dm_count = sum(
        db.query(sa_func.count(DmMessage.id))
        .filter(
            DmMessage.conversation_id == c.id,
            DmMessage.sender_id != user_id,
            DmMessage.read_at == None,
        )
        .scalar() or 0
        for c in convos
    )

    # Notification unread count
    notif_count = (
        db.query(sa_func.count(Notification.id))
        .filter(
            Notification.user_id == user_id,
            Notification.org_id == org_id,
            Notification.read_at == None,
        )
        .scalar() or 0
    )

    return {"unread_count": dm_count + notif_count}
