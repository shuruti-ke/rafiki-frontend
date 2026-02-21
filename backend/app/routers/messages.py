"""Messaging router — org wall + direct messages."""

import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func as sa_func
from datetime import datetime, timezone

from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id, get_current_role
from app.models.message import WallMessage, DmConversation, DmMessage
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

def _sorted_pair(a: uuid.UUID, b: uuid.UUID):
    """Sort UUIDs so participant_a < participant_b."""
    sa, sb = str(a), str(b)
    return (a, b) if sa < sb else (b, a)


@router.get("/conversations", response_model=list[ConversationResponse])
def list_conversations(
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    convos = (
        db.query(DmConversation)
        .filter(
            DmConversation.org_id == org_id,
            or_(DmConversation.participant_a == user_id, DmConversation.participant_b == user_id),
        )
        .all()
    )

    result = []
    for c in convos:
        other_id = c.participant_b if c.participant_a == user_id else c.participant_a
        other_name = db.query(User.name).filter(User.user_id == other_id).scalar() or "Unknown"

        last_msg = (
            db.query(DmMessage)
            .filter(DmMessage.conversation_id == c.id)
            .order_by(DmMessage.created_at.desc())
            .first()
        )

        unread = (
            db.query(sa_func.count(DmMessage.id))
            .filter(
                DmMessage.conversation_id == c.id,
                DmMessage.sender_id != user_id,
                DmMessage.read_at == None,
            )
            .scalar()
        )

        result.append({
            "id": c.id,
            "org_id": c.org_id,
            "participant_a": c.participant_a,
            "participant_b": c.participant_b,
            "other_user_name": other_name,
            "last_message": last_msg.content if last_msg else None,
            "last_message_at": last_msg.created_at if last_msg else None,
            "unread_count": unread or 0,
            "created_at": c.created_at,
        })

    result.sort(key=lambda x: x["last_message_at"] or x["created_at"], reverse=True)
    return result


@router.post("/conversations", response_model=ConversationResponse)
def start_conversation(
    body: StartConversationRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    if body.recipient_id == user_id:
        raise HTTPException(400, "Cannot message yourself")

    pa, pb = _sorted_pair(user_id, body.recipient_id)

    existing = db.query(DmConversation).filter(
        DmConversation.participant_a == pa,
        DmConversation.participant_b == pb,
    ).first()

    if existing:
        convo = existing
    else:
        convo = DmConversation(org_id=org_id, participant_a=pa, participant_b=pb)
        db.add(convo)
        db.flush()

    msg = DmMessage(conversation_id=convo.id, sender_id=user_id, content=body.content)
    db.add(msg)
    db.commit()
    db.refresh(convo)

    other_id = convo.participant_b if convo.participant_a == user_id else convo.participant_a
    other_name = db.query(User.name).filter(User.user_id == other_id).scalar() or "Unknown"

    return {
        "id": convo.id,
        "org_id": convo.org_id,
        "participant_a": convo.participant_a,
        "participant_b": convo.participant_b,
        "other_user_name": other_name,
        "last_message": body.content,
        "last_message_at": msg.created_at,
        "unread_count": 0,
        "created_at": convo.created_at,
    }


@router.get("/conversations/{conversation_id}/messages", response_model=list[DirectMessageResponse])
def get_messages(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    convo = db.query(DmConversation).filter(DmConversation.id == conversation_id).first()
    if not convo:
        raise HTTPException(404, "Conversation not found")
    if user_id not in (convo.participant_a, convo.participant_b):
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
    if user_id not in (convo.participant_a, convo.participant_b):
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
    if user_id not in (convo.participant_a, convo.participant_b):
        raise HTTPException(403, "Not a participant")

    now = datetime.now(timezone.utc)
    db.query(DmMessage).filter(
        DmMessage.conversation_id == conversation_id,
        DmMessage.sender_id != user_id,
        DmMessage.read_at == None,
    ).update({"read_at": now})
    db.commit()
    return {"ok": True}
