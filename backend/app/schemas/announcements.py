from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AnnouncementCreate(BaseModel):
    title: str
    content: str
    is_training: bool = False
    target_departments: list = []
    target_roles: list = []
    priority: str = "normal"
    expires_at: Optional[datetime] = None


class AnnouncementResponse(BaseModel):
    id: int
    org_id: int
    title: str
    content: str
    is_training: bool
    target_departments: list = []
    target_roles: list = []
    priority: str
    published_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    created_by: int
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
    id: int
    announcement_id: int
    user_id: int
    read_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TrainingAssignmentCreate(BaseModel):
    user_ids: list[int]
    due_date: Optional[datetime] = None


class TrainingAssignmentResponse(BaseModel):
    id: int
    announcement_id: int
    user_id: int
    assigned_by: int
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
