import enum
import uuid
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class DocumentCategory(str, enum.Enum):
    general = "general"
    policy = "policy"
    handbook = "handbook"
    benefits = "benefits"
    training = "training"
    compliance = "compliance"
    procedure = "procedure"
    template = "template"


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # ✅ DB is UUID
    org_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    file_path = Column(String(1000), nullable=False)
    original_filename = Column(String(500), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)
    category = Column(String(50), nullable=False, default="general")
    tags = Column(JSONB, nullable=True, default=list)
    version = Column(Integer, nullable=False, default=1)

    parent_id = Column(Integer, ForeignKey("documents.id"), nullable=True)

    is_current = Column(Boolean, nullable=False, default=True)
    is_indexed = Column(Boolean, nullable=False, default=False)

    # ✅ If uploaded_by is ALSO UUID in DB, change this too (very likely in your system)
    uploaded_by = Column(UUID(as_uuid=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")
    versions = relationship("Document", backref="parent", remote_side=[id])


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)

    # ✅ DB is UUID
    org_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    token_count = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    document = relationship("Document", back_populates="chunks")
