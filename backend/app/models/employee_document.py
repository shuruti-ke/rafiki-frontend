# backend/app/models/employee_document.py

import enum
import uuid

from sqlalchemy import Column, String, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.database import Base


# ---------------------------------------------------------
# Enums (kept as string values to match Path B DB design)
# ---------------------------------------------------------

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


# ---------------------------------------------------------
# Employee Documents
# ---------------------------------------------------------

class EmployeeDocument(Base):
    """
    Matches current DB structure (Path B).

    IMPORTANT FIX:
    - id now auto-generates UUID in application layer
    """

    __tablename__ = "employee_documents"

    # 🔥 CRITICAL FIX — generate UUID in app
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,  # ✅ FIXES your IntegrityError
    )

    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    org_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    # Keep VARCHAR (no DB enum)
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


# ---------------------------------------------------------
# Document Shares
# ---------------------------------------------------------

class DocumentShare(Base):
    """
    document_shares table

    NOTE:
    - This table MUST exist in DB
    - Uses server_default gen_random_uuid() (DB side)
    """

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

    # Keep VARCHAR (Path B)
    permission = Column(
        String(20),
        nullable=False,
        default=SharePermission.read.value,
    )

    revoked_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
