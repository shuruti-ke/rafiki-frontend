"""Add initial_password to employee_profiles

Revision ID: 019
Revises: 018
Create Date: 2026-02-25

Stores the plain-text temporary password generated at account creation so HR
admins can view/copy it from the employee profile. Cleared once the employee
resets their own password.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "019"
down_revision: Union[str, None] = "018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS initial_password VARCHAR(255)"
    ))


def downgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE employee_profiles DROP COLUMN IF EXISTS initial_password"
    ))
