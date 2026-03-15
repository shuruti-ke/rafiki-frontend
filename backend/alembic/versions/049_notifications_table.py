"""Create notifications table

Revision ID: 049_notifications
Revises: 048_coaching_structured
Create Date: 2026-03-15
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "049_notifications"
down_revision = "048_coaching_structured"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id    UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            org_id     UUID NOT NULL,
            kind       VARCHAR(64) NOT NULL,
            title      VARCHAR(255) NOT NULL,
            body       TEXT,
            link       TEXT,
            read_at    TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_notifications_org_id  ON notifications (org_id)")


def downgrade():
    op.execute("DROP TABLE IF EXISTS notifications")
