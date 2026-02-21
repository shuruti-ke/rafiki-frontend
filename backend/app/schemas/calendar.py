from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


class CalendarEventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    is_all_day: bool = False
    is_shared: bool = False
    color: str = "#8b5cf6"


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_all_day: Optional[bool] = None
    is_shared: Optional[bool] = None
    color: Optional[str] = None


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
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
