"""Add notes, action_items, outcome, follow_up_date, updated_at to coaching_sessions

Revision ID: 048_coaching_structured
Revises: 047_performance_review_criteria
Create Date: 2026-03-15

The coaching router expects these columns for CRUD; 011 only created
concern, outcome_logged, etc. This migration adds the structured session fields.
Uses IF NOT EXISTS / IF EXISTS so safe when columns were added elsewhere.
"""
from alembic import op

revision = "048_coaching_structured"
down_revision = "047_performance_review_criteria"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS notes TEXT")
    op.execute("ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS action_items JSONB DEFAULT '[]'::jsonb")
    op.execute("ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS outcome VARCHAR(20)")
    op.execute("ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS follow_up_date DATE")
    op.execute("ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ")


def downgrade():
    op.execute("ALTER TABLE coaching_sessions DROP COLUMN IF EXISTS updated_at")
    op.execute("ALTER TABLE coaching_sessions DROP COLUMN IF EXISTS follow_up_date")
    op.execute("ALTER TABLE coaching_sessions DROP COLUMN IF EXISTS outcome")
    op.execute("ALTER TABLE coaching_sessions DROP COLUMN IF EXISTS action_items")
    op.execute("ALTER TABLE coaching_sessions DROP COLUMN IF EXISTS notes")
