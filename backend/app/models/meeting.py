# backend/app/models/meeting.py
import uuid
import secrets
import string

from sqlalchemy import Column, String, DateTime, Boolean, Integer, Text
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func

from app.database import Base


def _generate_room_name() -> str:
    alphabet = string.ascii_lowercase + string.digits
    suffix = ''.join(secrets.choice(alphabet) for _ in range(10))
    return f"rafiki-{suffix}"


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    host_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    room_name = Column(String(200), nullable=False, unique=True, default=_generate_room_name)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, nullable=False, default=60)
    participant_ids = Column(ARRAY(UUID(as_uuid=True)), nullable=True, default=list)
    meeting_type = Column(String(50), nullable=False, default="group")
    is_active = Column(Boolean, nullable=False, default=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    recording_url = Column(String(1000), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())