"""
Notifications router — provides /unread-count for clients expecting /api/v1/notifications/.
Delegates to messages unread count.
"""

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id
from app.models.message import DmConversation, DmMessage, ConversationParticipant


def _insert_notification(
    db: Any,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    content: str,
    notification_type: Optional[str] = None,
    **kwargs: Any,
) -> None:
    """Stub for notification insertion. No-op — notifications are handled via messages."""
    pass


router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("/unread-count")
def get_unread_count(
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Return total unread DM count for the current user."""
    convo_ids = (
        db.query(ConversationParticipant.conversation_id)
        .filter(ConversationParticipant.user_id == user_id)
    )
    convos = (
        db.query(DmConversation)
        .filter(DmConversation.id.in_(convo_ids), DmConversation.org_id == org_id)
        .all()
    )
    total = sum(
        db.query(sa_func.count(DmMessage.id))
        .filter(
            DmMessage.conversation_id == c.id,
            DmMessage.sender_id != user_id,
            DmMessage.read_at == None,
        )
        .scalar() or 0
        for c in convos
    )
    return {"unread_count": total}
