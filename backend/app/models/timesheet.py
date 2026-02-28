from sqlalchemy import Column, String, Text, Boolean, DateTime, Date, Numeric
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class TimesheetEntry(Base):
    __tablename__ = "timesheet_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    org_id = Column(UUID(as_uuid=True), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    date = Column(Date, nullable=False)
    project = Column(String(200), nullable=False)
    category = Column(String(100), nullable=False, server_default="Development")
    hours = Column(Numeric(4, 1), nullable=False)
    description = Column(Text, server_default="", nullable=True)
    objective_id = Column(UUID(as_uuid=True), nullable=True)
    status = Column(String(20), nullable=False, server_default="draft")
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(UUID(as_uuid=True), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approval_comment = Column(Text, server_default="", nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
