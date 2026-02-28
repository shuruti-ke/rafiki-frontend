import uuid

from sqlalchemy import Column, String, Text, Boolean, DateTime, Date
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import Base


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    org_id = Column(UUID(as_uuid=True), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=True)  # ← DB allows NULL
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    
    # Added: date column (VARCHAR, NOT NULL, default='')
    date = Column(String, nullable=False, server_default="")
    
    start_time = Column(DateTime(timezone=True), nullable=True)  # ← DB allows NULL
    end_time = Column(DateTime(timezone=True), nullable=True)
    is_all_day = Column(Boolean, nullable=False, default=False)
    is_shared = Column(Boolean, nullable=False, default=False)
    color = Column(String, nullable=True)

    event_type = Column(String, nullable=False, server_default="meeting")
    location = Column(String, nullable=True)
    is_virtual = Column(Boolean, nullable=True, default=False)
    meeting_link = Column(String, nullable=True)
    recurrence = Column(String, nullable=True)
    recurrence_end = Column(Date, nullable=True)
    recurrence_parent = Column(UUID(as_uuid=True), nullable=True)
    attendees = Column(JSONB, nullable=True, server_default="[]")

    # Additional columns that exist in DB
    objective_id = Column(UUID(as_uuid=True), nullable=True)
    assigned_to = Column(UUID(as_uuid=True), nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    is_completed = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=True)
