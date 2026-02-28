from sqlalchemy import Column, String, Text, Boolean, DateTime, Date
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import Base


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    org_id = Column(UUID(as_uuid=True), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=True)
    is_all_day = Column(Boolean, nullable=False, default=False)
    is_shared = Column(Boolean, nullable=False, default=False)
    color = Column(String(20), default="#8b5cf6")

    event_type = Column(String(30), default="meeting")
    location = Column(String(500), nullable=True)
    is_virtual = Column(Boolean, default=False)
    meeting_link = Column(String(1000), nullable=True)
    recurrence = Column(String(20), nullable=True)
    recurrence_end = Column(Date, nullable=True)
    recurrence_parent = Column(UUID(as_uuid=True), nullable=True)
    attendees = Column(JSONB, default=[])

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
