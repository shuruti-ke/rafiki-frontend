from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


# ── Wall Messages ──

class WallMessageCreate(BaseModel):
    content: str


class WallMessageResponse(BaseModel):
    id: UUID
    org_id: UUID
    user_id: UUID
    content: str
    is_pinned: bool
    author_name: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Conversations ──

class StartConversationRequest(BaseModel):
    recipient_ids: list[UUID]
    content: str
    title: Optional[str] = None


class DirectMessageCreate(BaseModel):
    content: str


class DirectMessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    sender_id: UUID
    content: str
    read_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ParticipantInfo(BaseModel):
    id: UUID
    name: Optional[str] = None


class ConversationResponse(BaseModel):
    id: UUID
    org_id: UUID
    is_group: bool = False
    title: Optional[str] = None
    display_name: Optional[str] = None
    participants: list[ParticipantInfo] = []
    last_message: Optional[str] = None
    last_message_at: Optional[datetime] = None
    unread_count: int = 0
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ColleagueResponse(BaseModel):
    id: UUID
    name: Optional[str] = None
    email: Optional[str] = None

    model_config = {"from_attributes": True}
