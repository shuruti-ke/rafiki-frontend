from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


class DocumentResponse(BaseModel):
    # ✅ enables returning SQLAlchemy objects directly
    model_config = ConfigDict(from_attributes=True)

    # ✅ UUIDs come back as uuid.UUID objects, Pydantic will serialize to string
    id: str
    org_id: str

    title: str
    description: Optional[str] = None
    file_path: str
    original_filename: str
    mime_type: str
    file_size: int
    category: str

    # ✅ tags is JSONB array in DB
    tags: List[str] = []

    version: int

    parent_id: Optional[str] = None

    is_current: bool
    is_indexed: bool

    uploaded_by: Optional[str] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None


class DocumentSearchRequest(BaseModel):
    query: str
    limit: int = 5
