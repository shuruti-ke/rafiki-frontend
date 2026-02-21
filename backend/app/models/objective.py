from sqlalchemy import Column, String, Text, Integer, Float, Date, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class Objective(Base):
    __tablename__ = "objectives"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    org_id = Column(UUID(as_uuid=True), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    target_date = Column(Date, nullable=True)
    status = Column(String(50), nullable=False, default="draft")
    progress = Column(Integer, nullable=False, default=0)

    reviewed_by = Column(UUID(as_uuid=True), nullable=True)
    review_status = Column(String(50), nullable=True)
    review_notes = Column(Text, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    key_results = relationship("KeyResult", back_populates="objective", cascade="all, delete-orphan")


class KeyResult(Base):
    __tablename__ = "key_results"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    objective_id = Column(UUID(as_uuid=True), ForeignKey("objectives.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500), nullable=False)
    target_value = Column(Float, nullable=False, default=100)
    current_value = Column(Float, nullable=False, default=0)
    unit = Column(String(100), default="%")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    objective = relationship("Objective", back_populates="key_results")
