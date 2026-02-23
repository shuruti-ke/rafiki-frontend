# backend/app/models/employee_document.py
import enum
import uuid

from sqlalchemy import Column, String, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.database import Base


class EmployeeDocType(str, enum.Enum):
    contract = "contract"
    id_document = "id_document"
    certificate = "certificate"
    letter = "letter"
    payslip = "payslip"
    objective_attachment = "objective_attachment"
    other = "other"


class SharePermission(str, enum.Enum):
    read = "read"
    comment = "comment"


class EmployeeDocument(Base):
    __tablename__ = "employee_documents"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    org_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    doc_type = Column(String(50), nullable=False)
    title = Column(String(500), nullable=False)

    file_path = Column(String(1000), nullable=False)
    original_filename = Column(String(500), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)

    uploaded_by = Column(UUID(as_uuid=True), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class DocumentShare(Base):
    __tablename__ = "document_shares"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )

    org_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("employee_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    granted_by = Column(UUID(as_uuid=True), nullable=False)
    granted_to = Column(UUID(as_uuid=True), nullable=False, index=True)

    permission = Column(
        String(20),
        nullable=False,
        default=SharePermission.read.value,
    )

    revoked_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
