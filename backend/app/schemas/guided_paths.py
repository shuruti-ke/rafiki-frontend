from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ModuleStepDefinition(BaseModel):
    type: str  # intro, prompt, input, reflection, rating, summary, video, audio
    message: str
    expected_input: str | None = None  # none, free_text, rating_0_10
    safety_check: bool = False
    media_url: str | None = None  # YouTube/Vimeo URL for video, direct URL for audio


class ModuleCreate(BaseModel):
    name: str
    category: str
    description: str | None = None
    duration_minutes: int = 10
    icon: str = "brain"
    steps: list[ModuleStepDefinition] = []
    triggers: list[str] = []
    safety_checks: list[str] = []


class ModuleUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    icon: Optional[str] = None
    steps: Optional[list[ModuleStepDefinition]] = None
    triggers: Optional[list[str]] = None
    safety_checks: Optional[list[str]] = None
    is_active: Optional[bool] = None


class ModuleResponse(BaseModel):
    id: int
    org_id: int | None
    name: str
    category: str
    description: str | None = None
    duration_minutes: int
    icon: str | None = None
    is_active: bool
    created_by: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ModuleDetailResponse(ModuleResponse):
    steps: list[dict] | None = None
    triggers: list[str] | None = None
    safety_checks: list[str] | None = None


class ModuleStepResponse(BaseModel):
    step_index: int
    total_steps: int
    type: str
    message: str
    expected_input: str | None = None
    safety_check: bool = False
    media_url: str | None = None


class SessionResponse(BaseModel):
    id: int
    user_id: int
    org_id: int
    module_id: int
    current_step: int
    status: str
    pre_rating: int | None = None
    post_rating: int | None = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SessionStepResponse(BaseModel):
    session_id: int
    module_name: str
    step: ModuleStepResponse
    status: str


class AdvanceStepRequest(BaseModel):
    response: str | None = None


class StartSessionRequest(BaseModel):
    role_key: str | None = None
    language: str | None = "en"
    stress_band: str | None = None  # low, moderate, high, crisis
    theme_category: str | None = None
    available_time: int | None = None  # minutes
    pre_rating: int | None = None  # 0-10


class OutcomeRequest(BaseModel):
    pre_rating: int | None = None
    post_rating: int | None = None


class ModuleSuggestion(BaseModel):
    id: int
    name: str
    category: str
    description: str | None = None
    duration_minutes: int
    icon: str | None = None
    match_reason: str | None = None


class ModuleSuggestionsResponse(BaseModel):
    suggestions: list[ModuleSuggestion]
    theme: str | None = None
