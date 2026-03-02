from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from uuid import UUID
from pydantic import BaseModel
from typing import List, Optional

from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id
from app.models.chat_session import ChatSession, ChatMessage

router = APIRouter(prefix="/api/v1/chat/sessions", tags=["Chat Sessions"])


class SessionOut(BaseModel):
    id: str
    title: str
    updated_at: str

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: str

    class Config:
        from_attributes = True


@router.get("/")
def list_sessions(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    org_id: UUID = Depends(get_current_org_id),
):
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user_id, ChatSession.org_id == org_id)
        .order_by(desc(ChatSession.updated_at))
        .limit(50)
        .all()
    )
    return [
        {
            "id": str(s.id),
            "title": s.title,
            "updated_at": s.updated_at.isoformat() if s.updated_at else "",
        }
        for s in sessions
    ]


class CreateSessionRequest(BaseModel):
    title: Optional[str] = "New Chat"


@router.post("/")
def create_session(
    req: CreateSessionRequest,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    org_id: UUID = Depends(get_current_org_id),
):
    session = ChatSession(user_id=user_id, org_id=org_id, title=req.title or "New Chat")
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id": str(session.id), "title": session.title}


@router.get("/{session_id}/messages")
def get_messages(
    session_id: str,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id, ChatSession.user_id == user_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    return [
        {
            "id": str(m.id),
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else "",
        }
        for m in messages
    ]


@router.delete("/{session_id}")
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id, ChatSession.user_id == user_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
    db.delete(session)
    db.commit()
    return {"ok": True}
