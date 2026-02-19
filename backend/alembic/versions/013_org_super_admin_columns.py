"""Add super-admin columns to organizations table

Revision ID: 013
Revises: 012
Create Date: 2026-02-18

Idempotent -- uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
"""
from typing import Sequence, Union
from alembic import op

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Organization columns
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS industry VARCHAR(255)")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description TEXT")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS employee_count INTEGER")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE")
    # User columns (is_active may be missing from local 012)
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_active")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS is_active")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS employee_count")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS description")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS industry")
