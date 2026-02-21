from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from uuid import UUID


class KeyResultCreate(BaseModel):
    title: str
    target_value: float = 100
    current_value: float = 0
    unit: str = "%"


class KeyResultUpdate(BaseModel):
    title: Optional[str] = None
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    unit: Optional[str] = None


class KeyResultResponse(BaseModel):
    id: UUID
    objective_id: UUID
    title: str
    target_value: float
    current_value: float
    unit: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ObjectiveCreate(BaseModel):
    title: str
    description: Optional[str] = None
    target_date: Optional[date] = None
    key_results: list[KeyResultCreate] = []


class ObjectiveUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_date: Optional[date] = None
    status: Optional[str] = None


class ObjectiveResponse(BaseModel):
    id: UUID
    org_id: UUID
    user_id: UUID
    title: str
    description: Optional[str] = None
    target_date: Optional[date] = None
    status: str
    progress: int
    reviewed_by: Optional[UUID] = None
    review_status: Optional[str] = None
    review_notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    key_results: list[KeyResultResponse] = []

    model_config = {"from_attributes": True}


class ReviewRequest(BaseModel):
    review_status: str  # "approved" or "needs_revision"
    review_notes: Optional[str] = None
