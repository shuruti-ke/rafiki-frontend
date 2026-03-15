"""Add notes, action_items, outcome, follow_up_date, updated_at to coaching_sessions

Revision ID: 048_coaching_structured
Revises: 047_performance_review_criteria
Create Date: 2026-03-15

The coaching router expects these columns for CRUD; 011 only created
concern, outcome_logged, etc. This migration adds the structured session fields.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "048_coaching_structured"
down_revision = "047_performance_review_criteria"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "coaching_sessions",
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.add_column(
        "coaching_sessions",
        sa.Column("action_items", postgresql.JSONB(), nullable=True, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column(
        "coaching_sessions",
        sa.Column("outcome", sa.String(20), nullable=True),
    )
    op.add_column(
        "coaching_sessions",
        sa.Column("follow_up_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "coaching_sessions",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column("coaching_sessions", "updated_at")
    op.drop_column("coaching_sessions", "follow_up_date")
    op.drop_column("coaching_sessions", "outcome")
    op.drop_column("coaching_sessions", "action_items")
    op.drop_column("coaching_sessions", "notes")
