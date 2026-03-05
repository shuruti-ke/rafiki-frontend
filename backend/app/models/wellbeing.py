import uuid
from sqlalchemy import Column, String, Text, DateTime, Float, Integer, Boolean, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.database import Base


class CrisisAlert(Base):
    __tablename__ = "crisis_alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False)
    org_id = Column(UUID(as_uuid=True), ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False)
    session_id = Column(UUID(as_uuid=True), nullable=True)
    risk_level = Column(String(20), nullable=False)  # low, medium, high, critical
    trigger_text = Column(Text, nullable=True)
    detected_patterns = Column(JSONB, nullable=True)  # list of matched patterns
    status = Column(String(20), nullable=False, default="open")  # open, acknowledged, resolved
    acknowledged_by = Column(UUID(as_uuid=True), nullable=True)
    resolved_by = Column(UUID(as_uuid=True), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_crisis_alerts_org_created", "org_id", "created_at"),
        Index("ix_crisis_alerts_user_created", "user_id", "created_at"),
        Index("ix_crisis_alerts_org_status", "org_id", "status"),
    )


class ChatAnalytics(Base):
    __tablename__ = "chat_analytics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False)
    org_id = Column(UUID(as_uuid=True), ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False)
    message_text = Column(Text, nullable=True)
    stress_level = Column(Integer, nullable=True)  # 1-5
    sentiment = Column(Float, nullable=True)  # -1.0 to 1.0
    sentiment_label = Column(String(20), nullable=True)  # positive, neutral, negative
    topics = Column(JSONB, nullable=True)  # array of topic strings
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_chat_analytics_org_created", "org_id", "created_at"),
        Index("ix_chat_analytics_user_created", "user_id", "created_at"),
    )


class OrgCrisisConfig(Base):
    __tablename__ = "org_crisis_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False, unique=True)
    crisis_contacts = Column(JSONB, nullable=True)  # [{name, phone, email, role}]
    custom_helplines = Column(JSONB, nullable=True)  # [{name, number, country}]
    auto_alert_managers = Column(Boolean, default=True, nullable=False)
    auto_alert_hr = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
