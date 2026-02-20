import uuid
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.sql import func
from app.database import Base


class GuidedModule(Base):
    __tablename__ = "guided_modules"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # ✅ org_id is UUID in your platform
    # nullable=True means "global module" (not tied to a specific org)
    org_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("orgs.org_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    name = Column(String(300), nullable=False)
    category = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    duration_minutes = Column(Integer, nullable=False, default=10)
    icon = Column(String(50), nullable=True, default="brain")
    steps = Column(JSONB, nullable=False, default=list)
    triggers = Column(JSONB, nullable=True, default=list)
    safety_checks = Column(JSONB, nullable=True, default=list)
    is_active = Column(Boolean, nullable=False, default=True)

    # ✅ created_by should be UUID user_id
    created_by = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users_legacy.user_id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class GuidedPathSession(Base):
    __tablename__ = "guided_path_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # ✅ user_id is UUID
    user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users_legacy.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ✅ org_id is UUID
    org_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("orgs.org_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # module_id stays integer (guided_modules.id)
    module_id = Column(
        Integer,
        ForeignKey("guided_modules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    current_step = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="in_progress")
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    responses = Column(JSONB, nullable=True, default=list)

    # LLM-adapted steps cached on session
    composed_steps = Column(JSONB, nullable=True)

    # snapshot of context used
    context_pack = Column(JSONB, nullable=True)

    # stress before/after (0-10)
    pre_rating = Column(Integer, nullable=True)
    post_rating = Column(Integer, nullable=True)

    theme_category = Column(String(50), nullable=True)
    available_time = Column(Integer, nullable=True)  # minutes
