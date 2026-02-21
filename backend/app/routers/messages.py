"""Messaging router — org wall + direct/group messages."""

import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, func as sa_func
from datetime import datetime, timezone

from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id, get_current_role
from app.models.message import WallMessage, DmConversation, DmMessage, ConversationParticipant
from app.models.user import User
from app.schemas.messages import (
    WallMessageCreate, WallMessageResponse,
    StartConversationRequest, DirectMessageCreate, DirectMessageResponse,
    ConversationResponse, ColleagueResponse,
)

router = APIRouter(prefix="/api/v1/messages", tags=["Messaging"])


# ── Wall Messages ──

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
        d = {
            "id": msg.id,
            "org_id": msg.org_id,
            "user_id": msg.user_id,
            "content": msg.content,
            "is_pinned": msg.is_pinned,
            "author_name": author_name or "Unknown",
            "created_at": msg.created_at,
        }
        result.append(d)
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
    if msg.user_id != user_id and role not in ("hr_admin", "super_admin"):
        raise HTTPException(403, "Not authorized")
    db.delete(msg)
    db.commit()
    return {"ok": True}


# ── Colleagues ──

@router.get("/colleagues", response_model=list[ColleagueResponse])
def list_colleagues(
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    users = (
        db.query(User)
        .filter(User.org_id == org_id, User.user_id != user_id, User.is_active == True)
        .order_by(User.name)
        .all()
    )
    return [{"id": u.user_id, "name": u.name, "email": u.email} for u in users]


# ── Conversations ──

def _is_participant(db: Session, conversation_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    return db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == conversation_id,
        ConversationParticipant.user_id == user_id,
    ).first() is not None


def _resolve_display_name(db: Session, convo: DmConversation, user_id: uuid.UUID) -> str:
    """Compute a display name for a conversation relative to the viewing user."""
    if convo.title:
        return convo.title
    other_ids = [
        p.user_id for p in convo.participants
        if p.user_id != user_id
    ]
    if not other_ids:
        return "Empty conversation"
    names = []
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
            DmMessage.read_at == None,
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


@router.get("/conversations", response_model=list[ConversationResponse])
def list_conversations(
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    # Find all conversation IDs where user is a participant
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

    # For 1-on-1: check for existing conversation
    if not is_group:
        other_id = body.recipient_ids[0]
        # Find conversations where both users are participants and is_group=False
        my_convos = (
            db.query(ConversationParticipant.conversation_id)
            .filter(ConversationParticipant.user_id == user_id)
        )
        their_convos = (
            db.query(ConversationParticipant.conversation_id)
            .filter(ConversationParticipant.user_id == other_id)
        )
        shared = (
            db.query(DmConversation)
            .filter(
                DmConversation.id.in_(my_convos),
                DmConversation.id.in_(their_convos),
                DmConversation.is_group == False,
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

    now = datetime.now(timezone.utc)
    db.query(DmMessage).filter(
        DmMessage.conversation_id == conversation_id,
        DmMessage.sender_id != user_id,
        DmMessage.read_at == None,
    ).update({"read_at": now})
    db.commit()
    return {"ok": True}
