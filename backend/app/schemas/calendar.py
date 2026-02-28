from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from uuid import UUID


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
    attendees: list[dict] = []


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
    attendees: Optional[list[dict]] = None


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
    event_type: Optional[str] = "meeting"
    location: Optional[str] = None
    is_virtual: Optional[bool] = False
    meeting_link: Optional[str] = None
    recurrence: Optional[str] = None
    recurrence_end: Optional[date] = None
    recurrence_parent: Optional[UUID] = None
    attendees: Optional[list[dict]] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
