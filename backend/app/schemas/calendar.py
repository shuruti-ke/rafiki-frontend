"""
File: backend/app/schemas/calendar.py
Calendar event schemas for Pydantic validation.
"""

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
    date: str = ""  # VARCHAR NOT NULL DEFAULT ''
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_all_day: bool = False
    is_shared: bool = False
    color: Optional[str] = None
    event_type: str = "meeting"
    location: Optional[str] = None
    is_virtual: bool = False
    meeting_link: Optional[str] = None
    recurrence: Optional[str] = None
    recurrence_end: Optional[date] = None
    attendees: Optional[List[dict]] = []
    
    # Additional fields that exist in DB
    objective_id: Optional[UUID] = None
    assigned_to: Optional[UUID] = None
    is_completed: bool = False


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
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
    
    # Additional fields that exist in DB
    objective_id: Optional[UUID] = None
    assigned_to: Optional[UUID] = None
    is_completed: Optional[bool] = None


class CalendarEventResponse(BaseModel):
    id: UUID
    org_id: UUID
    user_id: Optional[UUID] = None
    title: str
    date: str
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_all_day: bool
    is_shared: bool
    color: Optional[str] = None
    event_type: str
    location: Optional[str] = None
    is_virtual: bool
    meeting_link: Optional[str] = None
    recurrence: Optional[str] = None
    recurrence_end: Optional[date] = None
    recurrence_parent: Optional[UUID] = None
    attendees: Optional[List[dict]] = []
    
    # Additional fields that exist in DB
    objective_id: Optional[UUID] = None
    assigned_to: Optional[UUID] = None
    created_by: Optional[UUID] = None
    is_completed: bool
    
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
