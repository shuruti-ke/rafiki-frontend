"""
Messaging router — org wall + direct/group messages.

UPDATED:
- Adds a small "system message" capability (used by Payroll approvals) WITHOUT breaking your existing DM/Wall UI.
- Works even if your DmMessage model does NOT have extra columns like `message_type`, `payload`, `subject`, etc.
  (It will store a readable fallback in `content`.)
- If your DmMessage model DOES have those columns, it will populate them.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id, get_current_role
from app.models.message import WallMessage, DmConversation, DmMessage, ConversationParticipant
from app.models.user import User
from app.schemas.messages import (
    WallMessageCreate,
    WallMessageResponse,
    StartConversationRequest,
    DirectMessageCreate,
    DirectMessageResponse,
    ConversationResponse,
    ColleagueResponse,
)

router = APIRouter(prefix="/api/v1/messages", tags=["Messaging"])

_PRIVILEGED_ROLES = {"hr_admin", "super_admin"}


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────
def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _set_if_attr(obj, attr: str, value: Any) -> None:
    """Set attribute if the SQLAlchemy model has that column/attribute."""
    if hasattr(obj, attr):
        setattr(obj, attr, value)


def _is_participant(db: Session, conversation_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    return (
        db.query(ConversationParticipant)
        .filter(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
        .first()
        is not None
    )


def _ensure_direct_conversation(
    db: Session,
    *,
    org_id: uuid.UUID,
    user_a: uuid.UUID,
    user_b: uuid.UUID,
) -> DmConversation:
    """
    Ensure a 1:1 conversation exists between user_a and user_b.
    Reuses existing, otherwise creates new with two participants.
    """
    if user_a == user_b:
        raise HTTPException(status_code=400, detail="Cannot create a conversation with yourself")

    a_convos = (
        db.query(ConversationParticipant.conversation_id)
        .filter(ConversationParticipant.user_id == user_a)
        .subquery()
    )
    b_convos = (
        db.query(ConversationParticipant.conversation_id)
        .filter(ConversationParticipant.user_id == user_b)
        .subquery()
    )

    convo = (
        db.query(DmConversation)
        .filter(
            DmConversation.org_id == org_id,
            DmConversation.is_group == False,  # noqa: E712
            DmConversation.id.in_(a_convos),
            DmConversation.id.in_(b_convos),
        )
        .first()
    )

    if convo:
        return convo

    convo = DmConversation(org_id=org_id, is_group=False, title=None)
    db.add(convo)
    db.flush()

    db.add(ConversationParticipant(conversation_id=convo.id, user_id=user_a))
    db.add(ConversationParticipant(conversation_id=convo.id, user_id=user_b))
    db.flush()

    return convo


def _resolve_display_name(db: Session, convo: DmConversation, user_id: uuid.UUID) -> str:
    """Compute a display name for a conversation relative to the viewing user."""
    if getattr(convo, "title", None):
        return convo.title

    other_ids = [p.user_id for p in convo.participants if p.user_id != user_id]
    if not other_ids:
        return "Empty conversation"

    names: list[str] = []
    for uid in other_ids:
        name = db.query(User.name).filter(User.user_id == uid).scalar()
        names.append(name or "Unknown")

    joined = ", ".join(names)
    if len(joined) > 60:
        joined = joined[:57] + "..."
    return joined


def _build_convo_response(db: Session, convo: DmConversation, user_id: uuid.UUID) -> dict:
    """Build a ConversationResponse dict for a conversation."""
    last_msg = (
        db.query(DmMessage)
        .filter(DmMessage.conversation_id == convo.id)
        .order_by(DmMessage.created_at.desc())
        .first()
    )

    unread = (
        db.query(sa_func.count(DmMessage.id))
        .filter(
            DmMessage.conversation_id == convo.id,
            DmMessage.sender_id != user_id,
            DmMessage.read_at == None,  # noqa: E711
        )
        .scalar()
    )

    participants = []
    for p in convo.participants:
        name = db.query(User.name).filter(User.user_id == p.user_id).scalar()
        participants.append({"id": p.user_id, "name": name or "Unknown"})

    return {
        "id": convo.id,
        "org_id": convo.org_id,
        "is_group": convo.is_group,
        "title": convo.title,
        "display_name": _resolve_display_name(db, convo, user_id),
        "participants": participants,
        "last_message": last_msg.content if last_msg else None,
        "last_message_at": last_msg.created_at if last_msg else None,
        "unread_count": unread or 0,
        "created_at": convo.created_at,
    }


def _format_system_fallback(subject: str, body: str, payload: Optional[dict]) -> str:
    """
    If your DmMessage table doesn't support subject/payload/message_type,
    we still store something readable in content.
    """
    lines = [f"[{subject}]", body.strip()]
    if payload:
        # Keep it readable and short. Frontend can still parse payload if column exists.
        if "download_url" in payload and payload["download_url"]:
            lines.append(f"File: {payload['download_url']}")
        if "actions" in payload and isinstance(payload["actions"], list):
            # show action labels
            labels = [a.get("label") for a in payload["actions"] if isinstance(a, dict) and a.get("label")]
            if labels:
                lines.append("Actions: " + ", ".join(labels))
    return "\n".join([x for x in lines if x])


# ─────────────────────────────────────────────────────────────
# Wall Messages
# ─────────────────────────────────────────────────────────────
@router.get("/wall", response_model=list[WallMessageResponse])
def list_wall_messages(
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(WallMessage, User.name)
        .outerjoin(User, User.user_id == WallMessage.user_id)
        .filter(WallMessage.org_id == org_id)
        .order_by(WallMessage.is_pinned.desc(), WallMessage.created_at.desc())
        .limit(100)
        .all()
    )

    result = []
    for msg, author_name in rows:
        result.append(
            {
                "id": msg.id,
                "org_id": msg.org_id,
                "user_id": msg.user_id,
                "content": msg.content,
                "is_pinned": msg.is_pinned,
                "author_name": author_name or "Unknown",
                "created_at": msg.created_at,
            }
        )
    return result


@router.post("/wall", response_model=WallMessageResponse)
def post_wall_message(
    body: WallMessageCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    msg = WallMessage(org_id=org_id, user_id=user_id, content=body.content)
    db.add(msg)
    db.commit()
    db.refresh(msg)

    author = db.query(User.name).filter(User.user_id == user_id).scalar()
    return {
        "id": msg.id,
        "org_id": msg.org_id,
        "user_id": msg.user_id,
        "content": msg.content,
        "is_pinned": msg.is_pinned,
        "author_name": author or "Unknown",
        "created_at": msg.created_at,
    }


@router.delete("/wall/{message_id}")
def delete_wall_message(
    message_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    msg = db.query(WallMessage).filter(WallMessage.id == message_id, WallMessage.org_id == org_id).first()
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg.user_id != user_id and role not in _PRIVILEGED_ROLES:
        raise HTTPException(403, "Not authorized")
    db.delete(msg)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────
# Colleagues
# ─────────────────────────────────────────────────────────────
@router.get("/colleagues", response_model=list[ColleagueResponse])
def list_colleagues(
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    users = (
        db.query(User)
        .filter(User.org_id == org_id, User.user_id != user_id, User.is_active == True)  # noqa: E712
        .order_by(User.name)
        .all()
    )
    return [{"id": u.user_id, "name": u.name, "email": u.email} for u in users]


# ─────────────────────────────────────────────────────────────
# Conversations
# ─────────────────────────────────────────────────────────────
@router.get("/conversations", response_model=list[ConversationResponse])
def list_conversations(
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    convo_ids = (
        db.query(ConversationParticipant.conversation_id)
        .filter(ConversationParticipant.user_id == user_id)
        .subquery()
    )

    convos = (
        db.query(DmConversation)
        .filter(
            DmConversation.id.in_(convo_ids),
            DmConversation.org_id == org_id,
        )
        .all()
    )

    result = [_build_convo_response(db, c, user_id) for c in convos]
    result.sort(key=lambda x: x["last_message_at"] or x["created_at"], reverse=True)
    return result


@router.post("/conversations", response_model=ConversationResponse)
def start_conversation(
    body: StartConversationRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    if not body.recipient_ids:
        raise HTTPException(400, "At least one recipient is required")
    if user_id in body.recipient_ids:
        raise HTTPException(400, "Cannot message yourself")

    all_participant_ids = [user_id] + list(body.recipient_ids)
    is_group = len(body.recipient_ids) > 1

    convo = None

    if not is_group:
        other_id = body.recipient_ids[0]

        my_convos = db.query(ConversationParticipant.conversation_id).filter(ConversationParticipant.user_id == user_id)
        their_convos = db.query(ConversationParticipant.conversation_id).filter(ConversationParticipant.user_id == other_id)

        shared = (
            db.query(DmConversation)
            .filter(
                DmConversation.id.in_(my_convos),
                DmConversation.id.in_(their_convos),
                DmConversation.is_group == False,  # noqa: E712
                DmConversation.org_id == org_id,
            )
            .first()
        )
        if shared:
            convo = shared

    if not convo:
        convo = DmConversation(org_id=org_id, is_group=is_group, title=body.title if is_group else None)
        db.add(convo)
        db.flush()
        for pid in all_participant_ids:
            db.add(ConversationParticipant(conversation_id=convo.id, user_id=pid))
        db.flush()

    msg = DmMessage(conversation_id=convo.id, sender_id=user_id, content=body.content)
    db.add(msg)
    db.commit()
    db.refresh(convo)

    return _build_convo_response(db, convo, user_id)


@router.get("/conversations/{conversation_id}/messages", response_model=list[DirectMessageResponse])
def get_messages(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    convo = db.query(DmConversation).filter(DmConversation.id == conversation_id).first()
    if not convo:
        raise HTTPException(404, "Conversation not found")
    if not _is_participant(db, conversation_id, user_id):
        raise HTTPException(403, "Not a participant")

    return (
        db.query(DmMessage)
        .filter(DmMessage.conversation_id == conversation_id)
        .order_by(DmMessage.created_at)
        .all()
    )


@router.post("/conversations/{conversation_id}/messages", response_model=DirectMessageResponse)
def send_message(
    conversation_id: uuid.UUID,
    body: DirectMessageCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    convo = db.query(DmConversation).filter(DmConversation.id == conversation_id).first()
    if not convo:
        raise HTTPException(404, "Conversation not found")
    if not _is_participant(db, conversation_id, user_id):
        raise HTTPException(403, "Not a participant")

    msg = DmMessage(conversation_id=conversation_id, sender_id=user_id, content=body.content)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


@router.post("/conversations/{conversation_id}/read")
def mark_read(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    convo = db.query(DmConversation).filter(DmConversation.id == conversation_id).first()
    if not convo:
        raise HTTPException(404, "Conversation not found")
    if not _is_participant(db, conversation_id, user_id):
        raise HTTPException(403, "Not a participant")

    now = _now_utc()
    db.query(DmMessage).filter(
        DmMessage.conversation_id == conversation_id,
        DmMessage.sender_id != user_id,
        DmMessage.read_at == None,  # noqa: E711
    ).update({"read_at": now})
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────
# NEW: System Messages (used by Payroll approvals)
# ─────────────────────────────────────────────────────────────
class SystemMessageCreate(BaseModel):
    recipient_id: uuid.UUID
    subject: str
    body: str
    message_type: Optional[str] = None
    payload: Optional[dict] = None


@router.post("/system/send")
def send_system_message(
    body: SystemMessageCreate,
    sender_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    """
    Sends a "system" message to a user.
    This is what Payroll uses to notify an approver and to notify HR Admin back.

    Storage strategy:
    - Always creates/uses a 1:1 DM conversation (sender <-> recipient).
    - If your DmMessage model has message_type/payload/subject columns, we fill them.
    - Otherwise we embed subject/body/action hints into `content` so it still works.
    """
    if role not in _PRIVILEGED_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Validate recipient belongs to org
    recipient = (
        db.query(User)
        .filter(User.user_id == body.recipient_id, User.org_id == org_id, User.is_active == True)  # noqa: E712
        .first()
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found in this organization")

    convo = _ensure_direct_conversation(db, org_id=org_id, user_a=sender_id, user_b=body.recipient_id)

    msg = DmMessage(
        conversation_id=convo.id,
        sender_id=sender_id,
        content=_format_system_fallback(body.subject, body.body, body.payload),
    )

    # Optional richer columns if your DmMessage supports them
    _set_if_attr(msg, "subject", body.subject)
    _set_if_attr(msg, "title", body.subject)
    _set_if_attr(msg, "message_type", body.message_type)
    _set_if_attr(msg, "type", body.message_type)
    _set_if_attr(msg, "payload", body.payload)
    _set_if_attr(msg, "meta", body.payload)

    db.add(msg)
    db.commit()

    return {"ok": True, "conversation_id": str(convo.id), "message_id": str(getattr(msg, "id", ""))}


@router.get("/system/inbox")
def list_system_inbox(
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """
    Lightweight inbox for actionable/system messages.
    If DmMessage doesn't have message_type/payload, this will still return content.
    """
    convo_ids = (
        db.query(ConversationParticipant.conversation_id)
        .filter(ConversationParticipant.user_id == user_id)
        .subquery()
    )

    # If message_type exists, prefer filtering on it. Otherwise just show latest messages.
    has_message_type = hasattr(DmMessage, "message_type") or hasattr(DmMessage, "type")

    q = (
        db.query(DmMessage)
        .join(DmConversation, DmConversation.id == DmMessage.conversation_id)
        .filter(DmConversation.org_id == org_id, DmMessage.conversation_id.in_(convo_ids))
        .order_by(DmMessage.created_at.desc())
        .limit(100)
    )

    rows = q.all()

    items = []
    for m in rows:
        mt = getattr(m, "message_type", None) or getattr(m, "type", None)
        if has_message_type:
            # only keep "systemy" ones, but don't break if mt is None
            if not mt:
                continue
            if not str(mt).startswith("payroll_") and str(mt) not in ("system", "notification"):
                continue

        items.append(
            {
                "id": str(getattr(m, "id", "")),
                "conversation_id": str(m.conversation_id),
                "sender_id": str(m.sender_id),
                "created_at": m.created_at,
                "read_at": getattr(m, "read_at", None),
                "message_type": mt,
                "subject": getattr(m, "subject", None) or getattr(m, "title", None),
                "content": m.content,
                "payload": getattr(m, "payload", None) or getattr(m, "meta", None),
            }
        )

    return {"items": items}
