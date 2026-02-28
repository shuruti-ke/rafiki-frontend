from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from uuid import UUID
from decimal import Decimal


class TimesheetEntryCreate(BaseModel):
    date: date
    project: str
    category: str = "Development"
    hours: Decimal = Field(gt=0, le=24)
    description: str = ""
    objective_id: Optional[UUID] = None


class TimesheetEntryUpdate(BaseModel):
    date: Optional[date] = None
    project: Optional[str] = None
    category: Optional[str] = None
    hours: Optional[Decimal] = Field(default=None, gt=0, le=24)
    description: Optional[str] = None
    objective_id: Optional[UUID] = None


class TimesheetEntryResponse(BaseModel):
    id: UUID
    org_id: UUID
    user_id: UUID
    date: date
    project: str
    category: str
    hours: Decimal
    description: str
    objective_id: Optional[UUID] = None
    status: str
    submitted_at: Optional[datetime] = None
    approved_by: Optional[UUID] = None
    approved_at: Optional[datetime] = None
    approval_comment: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TimesheetSubmit(BaseModel):
    entry_ids: list[UUID]


class TimesheetApproval(BaseModel):
    entry_ids: list[UUID]
    action: str = "approve"  # "approve" or "reject"
    comment: str = ""
