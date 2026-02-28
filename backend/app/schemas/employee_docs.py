import uuid
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict


class EmployeeDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    org_id: uuid.UUID
    doc_type: str
    title: str
    file_path: str
    original_filename: str
    mime_type: str
    file_size: int
    uploaded_by: uuid.UUID
    visibility: str = "private"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DocumentShareResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    document_id: uuid.UUID
    granted_by: uuid.UUID
    granted_to: uuid.UUID
    permission: str
    revoked_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


# ---- Performance ----

class PerformanceEvaluationCreate(BaseModel):
    evaluation_period: str
    overall_rating: int
    strengths: Optional[str] = None
    areas_for_improvement: Optional[str] = None
    goals_for_next_period: Optional[str] = None
    comments: Optional[str] = None
    objective_ids: Optional[List[uuid.UUID]] = None


class PerformanceEvaluationUpdate(BaseModel):
    evaluation_period: Optional[str] = None
    overall_rating: Optional[int] = None
    strengths: Optional[str] = None
    areas_for_improvement: Optional[str] = None
    goals_for_next_period: Optional[str] = None
    comments: Optional[str] = None
    objective_ids: Optional[List[uuid.UUID]] = None


class PerformanceEvaluationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    org_id: uuid.UUID
    evaluation_period: str
    evaluator_id: uuid.UUID
    overall_rating: int
    strengths: Optional[str] = None
    areas_for_improvement: Optional[str] = None
    goals_for_next_period: Optional[str] = None
    comments: Optional[str] = None
    objective_ids: Optional[List[uuid.UUID]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---- Disciplinary ----

class DisciplinaryRecordCreate(BaseModel):
    record_type: str
    description: str
    date_of_incident: Optional[datetime] = None
    witnesses: Optional[str] = None
    outcome: Optional[str] = None
    attachments: Optional[dict] = None


class DisciplinaryRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    org_id: uuid.UUID
    record_type: str
    description: str
    date_of_incident: Optional[datetime] = None
    recorded_by: uuid.UUID
    witnesses: Optional[str] = None
    outcome: Optional[str] = None
    attachments: Optional[dict] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
