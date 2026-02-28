"""Calendar event schemas."""

from pydantic import BaseModel, ConfigDict
from datetime import datetime, date
from typing import Optional, List
from uuid import UUID


# ── Colleague Response ──


class ColleagueResponse(BaseModel):
    id: str
    name: str
    email: str


# ── Calendar Event Schemas ──


class CalendarEventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    is_all_day: bool = False
    is_shared: bool = False
    color: str = "#8b5cf6"
    event_type: str = "meeting"
    location: Optional[str] = None
    is_virtual: bool = False
    meeting_link: Optional[str] = None
    recurrence: Optional[str] = None
    recurrence_end: Optional[date] = None
    attendees: Optional[List[dict]] = []


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_all_day: Optional[bool] = None
    is_shared: Optional[bool] = None
    color: Optional[str] = None
    event_type: Optional[str] = None
    location: Optional[str] = None
    is_virtual: Optional[bool] = None
    meeting_link: Optional[str] = None
    recurrence: Optional[str] = None
    recurrence_end: Optional[date] = None
    attendees: Optional[List[dict]] = None


class CalendarEventResponse(BaseModel):
    id: UUID
    org_id: UUID
    user_id: UUID
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    is_all_day: bool
    is_shared: bool
    color: str
    event_type: str
    location: Optional[str] = None
    is_virtual: bool
    meeting_link: Optional[str] = None
    recurrence: Optional[str] = None
    recurrence_end: Optional[date] = None
    recurrence_parent: Optional[UUID] = None
    attendees: Optional[List[dict]] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
