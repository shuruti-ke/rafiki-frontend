"""Billing models: Services (platform offerings) and Invoices."""
from sqlalchemy import Column, Integer, Numeric, String, Text, Boolean, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.database import Base


class Service(Base):
    """Platform services that can be billed (e.g. training, consultation, subscription)."""
    __tablename__ = "billing_services"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    org_id = Column(UUID(as_uuid=True), ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    price_minor = Column(Integer, nullable=False)  # price in minor units (cents)
    currency = Column(String(3), nullable=False, default="KES")

    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Invoice(Base):
    """Invoice for a user (employee, manager) or org."""
    __tablename__ = "billing_invoices"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    org_id = Column(UUID(as_uuid=True), ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False, index=True)

    user_id = Column(UUID(as_uuid=True), ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True, index=True)
    invoice_number = Column(String(50), nullable=False, index=True)
    amount_minor = Column(Integer, nullable=False)  # total in minor units
    currency = Column(String(3), nullable=False, default="KES")

    status = Column(String(20), nullable=False, default="PENDING")  # PENDING, PAID, CANCELLED
    purpose = Column(String(100), nullable=True)  # e.g. training, consultation
    due_date = Column(DateTime(timezone=True), nullable=True)
    description_json = Column(JSONB, nullable=True)  # { purpose, summary, line_items }

    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class InvoiceLineItem(Base):
    """Line item on an invoice."""
    __tablename__ = "billing_invoice_line_items"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("billing_invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    service_id = Column(UUID(as_uuid=True), ForeignKey("billing_services.id", ondelete="SET NULL"), nullable=True)

    description = Column(String(500), nullable=False)
    quantity = Column(Numeric(12, 2), nullable=False, default=1)
    unit_price_minor = Column(Integer, nullable=False)
    amount_minor = Column(Integer, nullable=False)  # quantity * unit_price_minor


class Payment(Base):
    """Payment received against an invoice. Supports M-Pesa, cash, cheque, EFT/RTGS."""
    __tablename__ = "billing_payments"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("billing_invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    org_id = Column(UUID(as_uuid=True), ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False, index=True)

    method = Column(String(20), nullable=False)  # MPESA, CASH, CHEQUE, EFT_RTGS
    amount_minor = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default="KES")

    # Reference: M-Pesa transaction code, cheque number, or bank transfer reference
    reference = Column(String(100), nullable=True)

    # Optional proof attachments (R2 storage keys)
    attachment_storage_key = Column(String(500), nullable=True)  # cheque image or transaction screenshot
    attachment_original_name = Column(String(255), nullable=True)

    received_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True)
    received_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
