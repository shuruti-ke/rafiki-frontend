import enum
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func, text
from app.database import Base


class DisciplinaryRecordType(str, enum.Enum):
    verbal_warning = "verbal_warning"
    written_warning = "written_warning"
    suspension = "suspension"
    termination = "termination"
    other = "other"


class PerformanceEvaluation(Base):
    __tablename__ = "performance_evaluations"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    org_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    evaluation_period = Column(String(100), nullable=False)
    evaluator_id = Column(UUID(as_uuid=True), nullable=False)
    overall_rating = Column(Integer, nullable=False)
    strengths = Column(Text, nullable=True)
    areas_for_improvement = Column(Text, nullable=True)
    goals_for_next_period = Column(Text, nullable=True)
    comments = Column(Text, nullable=True)
    objective_ids = Column(JSONB, nullable=True, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("overall_rating >= 1 AND overall_rating <= 5", name="ck_eval_rating_range"),
    )


class DisciplinaryRecord(Base):
    __tablename__ = "disciplinary_records"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    org_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    record_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    date_of_incident = Column(Date, nullable=False)
    recorded_by = Column(UUID(as_uuid=True), nullable=False)
    witnesses = Column(JSONB, nullable=True, default=list)
    outcome = Column(Text, nullable=True)
    attachments = Column(JSONB, nullable=True, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
