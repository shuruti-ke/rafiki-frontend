"""Add manager role enum value and user profile fields

Revision ID: 016
Revises: 015
Create Date: 2026-02-22

Note: document_shares, payroll_templates, payroll_batches, and payslips tables
already exist in the database. This migration only adds the 'manager' role enum
and department/job_title/manager_id columns to users_legacy.
"""
from typing import Sequence, Union
from alembic import op

revision: str = "016"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Add 'manager' to user_role_enum ──
    op.execute("ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'manager'")

    # ── 2. Add profile fields to users_legacy ──
    op.execute("ALTER TABLE users_legacy ADD COLUMN IF NOT EXISTS department VARCHAR(100)")
    op.execute("ALTER TABLE users_legacy ADD COLUMN IF NOT EXISTS job_title VARCHAR(200)")
    op.execute("ALTER TABLE users_legacy ADD COLUMN IF NOT EXISTS manager_id UUID")


def downgrade() -> None:
    op.execute("ALTER TABLE users_legacy DROP COLUMN IF EXISTS manager_id")
    op.execute("ALTER TABLE users_legacy DROP COLUMN IF EXISTS job_title")
    op.execute("ALTER TABLE users_legacy DROP COLUMN IF EXISTS department")
