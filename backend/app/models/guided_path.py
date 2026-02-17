from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.database import Base


class GuidedModule(Base):
    __tablename__ = "guided_modules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    org_id = Column(Integer, nullable=True, index=True)  # null = global module
    name = Column(String(300), nullable=False)
    category = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    duration_minutes = Column(Integer, nullable=False, default=10)
    icon = Column(String(50), nullable=True, default="brain")
    steps = Column(JSONB, nullable=False, default=list)
    triggers = Column(JSONB, nullable=True, default=list)
    safety_checks = Column(JSONB, nullable=True, default=list)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class GuidedPathSession(Base):
    __tablename__ = "guided_path_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    org_id = Column(Integer, nullable=False, index=True)
    module_id = Column(Integer, nullable=False, index=True)
    current_step = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="in_progress")
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    responses = Column(JSONB, nullable=True, default=list)
    composed_steps = Column(JSONB, nullable=True)  # LLM-adapted steps cached on session
    context_pack = Column(JSONB, nullable=True)  # snapshot of context used
    pre_rating = Column(Integer, nullable=True)  # stress before (0-10)
    post_rating = Column(Integer, nullable=True)  # stress after (0-10)
    theme_category = Column(String(50), nullable=True)
    available_time = Column(Integer, nullable=True)  # minutes
