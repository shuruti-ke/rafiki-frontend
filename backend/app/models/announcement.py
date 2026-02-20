import enum
import uuid

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class AnnouncementPriority(str, enum.Enum):
    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # ✅ FIX: org_id is UUID in your schema
    org_id = Column(PGUUID(as_uuid=True), ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False, index=True)

    title = Column(String(500), nullable=False)
    content = Column(Text, nullable=False)
    is_training = Column(Boolean, nullable=False, default=False)

    target_departments = Column(JSONB, nullable=True, default=list)
    target_roles = Column(JSONB, nullable=True, default=list)

    priority = Column(String(20), nullable=False, default="normal")

    published_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # ✅ FIX: users_legacy.user_id is UUID
    created_by = Column(PGUUID(as_uuid=True), ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    reads = relationship("AnnouncementRead", back_populates="announcement", cascade="all, delete-orphan")
    training_assignments = relationship("TrainingAssignment", back_populates="announcement", cascade="all, delete-orphan")


class AnnouncementRead(Base):
    __tablename__ = "announcement_reads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    announcement_id = Column(Integer, ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False)

    # ✅ FIX: users_legacy.user_id is UUID
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False)

    read_at = Column(DateTime(timezone=True), server_default=func.now())

    announcement = relationship("Announcement", back_populates="reads")

    __table_args__ = (
        UniqueConstraint("announcement_id", "user_id", name="uq_announcement_read_user"),
    )


class TrainingAssignment(Base):
    __tablename__ = "training_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    announcement_id = Column(Integer, ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False)

    # ✅ FIX: users_legacy.user_id is UUID
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False)

    # ✅ FIX: users_legacy.user_id is UUID
    assigned_by = Column(PGUUID(as_uuid=True), ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True)

    due_date = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    announcement = relationship("Announcement", back_populates="training_assignments")

    __table_args__ = (
        UniqueConstraint("announcement_id", "user_id", name="uq_training_assignment_user"),
    )
