import enum
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, CheckConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.database import Base


class ManagerLevel(str, enum.Enum):
    L1 = "L1"  # direct reports only
    L2 = "L2"  # department-wide
    L3 = "L3"  # multi-department
    L4 = "L4"  # org-wide aggregates only


class ToolkitCategory(str, enum.Enum):
    coaching = "coaching"
    pip = "pip"
    conflict = "conflict"
    development = "development"
    conversation = "conversation"
    compliance = "compliance"


class ManagerConfig(Base):
    __tablename__ = "manager_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, unique=True, index=True)  # The manager (maps to auth user)
    org_id = Column(Integer, nullable=False, index=True)
    org_member_id = Column(Integer, nullable=True, index=True)  # Links user to OrgMember identity
    manager_level = Column(String(10), nullable=False, default="L1")
    allowed_data_types = Column(JSONB, nullable=True, default=list)  # ["profile","objectives","evaluations"]
    allowed_features = Column(JSONB, nullable=True, default=list)  # ["coaching_ai","pip_tools","dev_plans"]
    department_scope = Column(JSONB, nullable=True, default=list)  # For L2/L3: which departments
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ToolkitModule(Base):
    __tablename__ = "toolkit_modules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    org_id = Column(Integer, nullable=True, index=True)  # null = platform-wide default
    category = Column(String(50), nullable=False)
    title = Column(String(300), nullable=False)
    content = Column(JSONB, nullable=False, default=dict)  # {sections: [{heading, body, prompts}]}
    version = Column(Integer, nullable=False, default=1)
    is_active = Column(Boolean, nullable=False, default=True)
    language = Column(String(10), nullable=False, default="en")
    created_by = Column(Integer, nullable=True)
    approved_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CoachingSession(Base):
    __tablename__ = "coaching_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    manager_id = Column(Integer, nullable=False, index=True)  # user_id of the manager
    org_id = Column(Integer, nullable=False, index=True)
    employee_member_id = Column(Integer, nullable=False, index=True)  # user_id of the employee
    employee_name = Column(String(255), nullable=True)  # Denormalized for display
    concern = Column(Text, nullable=False)  # Manager's input
    context_used = Column(JSONB, nullable=True)  # What data was assembled (for audit)
    ai_response = Column(Text, nullable=True)  # Generated coaching plan
    structured_response = Column(JSONB, nullable=True)  # Parsed structured plan
    outcome_logged = Column(String(20), nullable=True)  # improved/same/worse/not_logged
    created_at = Column(DateTime(timezone=True), server_default=func.now())
