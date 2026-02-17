from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date


class EmployeeDocumentResponse(BaseModel):
    id: int
    user_id: int
    org_id: int
    doc_type: str
    title: str
    file_path: str
    original_filename: str
    mime_type: str
    file_size: int
    uploaded_by: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PerformanceEvaluationCreate(BaseModel):
    evaluation_period: str
    evaluator_id: int
    overall_rating: int
    strengths: Optional[str] = None
    areas_for_improvement: Optional[str] = None
    goals_for_next_period: Optional[str] = None
    comments: Optional[str] = None
    objective_ids: list = []


class PerformanceEvaluationResponse(BaseModel):
    id: int
    user_id: int
    org_id: int
    evaluation_period: str
    evaluator_id: int
    overall_rating: int
    strengths: Optional[str] = None
    areas_for_improvement: Optional[str] = None
    goals_for_next_period: Optional[str] = None
    comments: Optional[str] = None
    objective_ids: list = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PerformanceEvaluationUpdate(BaseModel):
    overall_rating: Optional[int] = None
    strengths: Optional[str] = None
    areas_for_improvement: Optional[str] = None
    goals_for_next_period: Optional[str] = None
    comments: Optional[str] = None
    objective_ids: Optional[list] = None


class DisciplinaryRecordCreate(BaseModel):
    record_type: str
    description: str
    date_of_incident: date
    witnesses: list = []
    outcome: Optional[str] = None
    attachments: list = []


class DisciplinaryRecordResponse(BaseModel):
    id: int
    user_id: int
    org_id: int
    record_type: str
    description: str
    date_of_incident: date
    recorded_by: int
    witnesses: list = []
    outcome: Optional[str] = None
    attachments: list = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
