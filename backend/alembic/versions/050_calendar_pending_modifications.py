"""Add pending_modifications JSONB column to calendar_events

Revision ID: 050_calendar_pending_mods
Revises: 049_notifications
Create Date: 2026-03-15
"""

from alembic import op

revision = "050_calendar_pending_mods"
down_revision = "049_notifications"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE calendar_events
        ADD COLUMN IF NOT EXISTS pending_modifications JSONB NOT NULL DEFAULT '[]'
    """)


def downgrade():
    op.execute("ALTER TABLE calendar_events DROP COLUMN IF EXISTS pending_modifications")
