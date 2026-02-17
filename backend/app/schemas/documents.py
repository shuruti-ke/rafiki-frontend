from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class DocumentResponse(BaseModel):
    id: int
    org_id: int
    title: str
    description: Optional[str] = None
    file_path: str
    original_filename: str
    mime_type: str
    file_size: int
    category: str
    tags: list = []
    version: int
    parent_id: Optional[int] = None
    is_current: bool
    is_indexed: bool
    uploaded_by: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[list] = None


class DocumentSearchRequest(BaseModel):
    query: str
    limit: int = 5
