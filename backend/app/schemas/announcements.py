from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


class AnnouncementCreate(BaseModel):
    title: str
    content: str
    is_training: bool = False
    target_departments: list = []
    target_roles: list = []
    priority: str = "normal"
    expires_at: Optional[datetime] = None


class AnnouncementResponse(BaseModel):
    id: UUID
    org_id: UUID
    title: str
    content: str
    is_training: bool
    target_departments: list = []
    target_roles: list = []
    priority: str
    published_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    created_by: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    is_training: Optional[bool] = None
    target_departments: Optional[list] = None
    target_roles: Optional[list] = None
    priority: Optional[str] = None
    expires_at: Optional[datetime] = None


class ReadReceiptResponse(BaseModel):
    id: UUID
    announcement_id: UUID
    user_id: UUID
    read_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class TrainingAssignmentCreate(BaseModel):
    user_ids: list[UUID]
    due_date: Optional[datetime] = None


class TrainingAssignmentResponse(BaseModel):
    id: UUID
    announcement_id: UUID
    user_id: UUID
    assigned_by: UUID
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    model_config = {"from_attributes": True}
