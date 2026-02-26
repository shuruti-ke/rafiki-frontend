from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


# --- Manager Config ---

class ManagerConfigCreate(BaseModel):
    user_id: UUID
    org_member_id: Optional[UUID] = None
    manager_level: str = "L1"
    allowed_data_types: list = ["profile", "objectives", "evaluations"]
    allowed_features: list = ["coaching_ai"]
    department_scope: list = []


class ManagerConfigUpdate(BaseModel):
    org_member_id: Optional[UUID] = None
    manager_level: Optional[str] = None
    allowed_data_types: Optional[list] = None
    allowed_features: Optional[list] = None
    department_scope: Optional[list] = None
    is_active: Optional[bool] = None


class ManagerConfigResponse(BaseModel):
    id: int
    user_id: UUID
    org_id: UUID
    org_member_id: Optional[UUID] = None
    manager_level: str
    allowed_data_types: list = []
    allowed_features: list = []
    department_scope: list = []
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Team Member (composite view) ---

class TeamMemberResponse(BaseModel):
    user_id: UUID
    name: str
    job_title: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    objectives_count: int = 0
    last_evaluation_rating: Optional[int] = None


# --- Coaching ---

class CoachingRequest(BaseModel):
    employee_member_id: UUID
    concern: str


class CoachingResponse(BaseModel):
    session_id: int
    employee_name: Optional[str] = None
    situation_summary: str
    conversation_script: str
    action_options: list[str] = []
    escalation_path: str = ""


class CoachingSessionResponse(BaseModel):
    id: int
    manager_id: UUID
    org_id: UUID
    employee_member_id: UUID
    employee_name: Optional[str] = None
    concern: str
    ai_response: Optional[str] = None
    structured_response: Optional[dict] = None
    outcome_logged: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CoachingOutcomeUpdate(BaseModel):
    outcome: str  # improved / same / worse


# --- Toolkit Module ---

class ToolkitModuleCreate(BaseModel):
    category: str
    title: str
    content: dict = {}
    language: str = "en"


class ToolkitModuleUpdate(BaseModel):
    category: Optional[str] = None
    title: Optional[str] = None
    content: Optional[dict] = None
    is_active: Optional[bool] = None
    language: Optional[str] = None


class ToolkitModuleResponse(BaseModel):
    id: int
    org_id: Optional[UUID] = None
    category: str
    title: str
    content: dict = {}
    version: int
    is_active: bool
    language: str
    created_by: Optional[UUID] = None
    approved_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Dashboard ---

class ManagerDashboardData(BaseModel):
    team_size: int = 0
    active_objectives: int = 0
    pending_evaluations: int = 0
    recent_coaching_sessions: int = 0
