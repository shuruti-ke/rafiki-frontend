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
    agenda: Optional[str] = None
    summary: Optional[str] = None
    action_items: Optional[List[str]] = None
    wellbeing_rating: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AgendaResponse(BaseModel):
    meeting_id: uuid.UUID
    agenda: str


class SummaryRequest(BaseModel):
    notes: Optional[str] = None  # optional transcript/notes paste from user


class SummaryResponse(BaseModel):
    meeting_id: uuid.UUID
    summary: str
    action_items: List[str]


class WellbeingRequest(BaseModel):
    rating: int  # 1-5
    note: Optional[str] = None


class PushObjectivesRequest(BaseModel):
    action_items: List[str]
    target_date: Optional[str] = None  # ISO date string e.g. "2026-03-31"
