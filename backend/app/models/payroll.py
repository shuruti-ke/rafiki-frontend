"""Models matching existing payroll_templates, payroll_batches, payslips tables."""
from sqlalchemy import Column, Integer, Boolean, DateTime, Numeric, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func, text
from app.database import Base


class PayrollTemplate(Base):
    __tablename__ = "payroll_templates"

    template_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    org_id = Column(UUID(as_uuid=True), nullable=False)
    title = Column(Text, nullable=False)
    storage_key = Column(Text, nullable=False)
    mime_type = Column(Text, nullable=False)
    created_by_user_id = Column(UUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    is_active = Column(Boolean, nullable=False, server_default=text("true"))


class PayrollBatch(Base):
    __tablename__ = "payroll_batches"

    batch_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    org_id = Column(UUID(as_uuid=True), nullable=False)
    period_year = Column(Integer, nullable=False)
    period_month = Column(Integer, nullable=False)
    template_id = Column(UUID(as_uuid=True), ForeignKey("payroll_templates.template_id"), nullable=False)
    upload_storage_key = Column(Text, nullable=False)
    upload_mime_type = Column(Text, nullable=False)
    status = Column(Text, nullable=False, server_default=text("'uploaded'"))
    payroll_total = Column(Numeric, nullable=True)
    computed_total = Column(Numeric, nullable=True)
    discrepancy = Column(Numeric, nullable=True)
    created_by_user_id = Column(UUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    approved_by_user_id = Column(UUID(as_uuid=True), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    distributed_at = Column(DateTime(timezone=True), nullable=True)


class Payslip(Base):
    __tablename__ = "payslips"

    payslip_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    org_id = Column(UUID(as_uuid=True), nullable=False)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("payroll_batches.batch_id", ondelete="CASCADE"), nullable=False)
    employee_user_id = Column(UUID(as_uuid=True), nullable=False)
    gross_pay = Column(Numeric, nullable=True)
    total_deductions = Column(Numeric, nullable=True)
    net_pay = Column(Numeric, nullable=True)
    document_id = Column(UUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
