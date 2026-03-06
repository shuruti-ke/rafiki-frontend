# app/models/notification.py
"""
Notification model — stores in-app notification rows.

Migration (Alembic):
    op.create_table(
        "notifications",
        sa.Column("id",         postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id",    postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id",     postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind",       sa.String(64),  nullable=False),
        sa.Column("title",      sa.String(255), nullable=False),
        sa.Column("body",       sa.Text,        nullable=True),
        sa.Column("link",       sa.Text,        nullable=True),
        sa.Column("read_at",    sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_org_id",  "notifications", ["org_id"])
"""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Column, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from app.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id         = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id    = Column(PGUUID(as_uuid=True), nullable=False, index=True)
    org_id     = Column(PGUUID(as_uuid=True), nullable=False, index=True)
    kind       = Column(String(64),  nullable=False)           # e.g. "announcement_reminder"
    title      = Column(String(255), nullable=False)
    body       = Column(Text,        nullable=True)
    link       = Column(Text,        nullable=True)
    read_at    = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
