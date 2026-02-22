from sqlalchemy import Column, DateTime, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database import Base


class DocumentShare(Base):
    __tablename__ = "document_shares"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    org_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("employee_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    granted_by = Column(UUID(as_uuid=True), nullable=False)
    granted_to = Column(UUID(as_uuid=True), nullable=False, index=True)

    permission = Column(String(20), nullable=False, default="read")

    revoked_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())