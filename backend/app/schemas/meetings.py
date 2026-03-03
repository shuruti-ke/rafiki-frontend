# backend/app/schemas/meetings.py
import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class MeetingCreate(BaseModel):
    title: str
    description: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration_minutes: int = 60
    participant_ids: Optional[List[uuid.UUID]] = []
    meeting_type: str = "group"


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    participant_ids: Optional[List[uuid.UUID]] = None


class MeetingResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    host_id: uuid.UUID
    title: str
    description: Optional[str]
    room_name: str
    jitsi_url: str
    scheduled_at: Optional[datetime]
    duration_minutes: int
    participant_ids: Optional[List[uuid.UUID]]
    meeting_type: str
    is_active: bool
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    recording_url: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True