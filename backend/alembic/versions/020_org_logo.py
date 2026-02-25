"""Add logo_storage_key to orgs and org_profiles

Revision ID: 020
Revises: 019
Create Date: 2026-02-25
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "020"
down_revision: Union[str, None] = "019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE orgs ADD COLUMN IF NOT EXISTS logo_storage_key VARCHAR(1000)"
    ))


def downgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE orgs DROP COLUMN IF EXISTS logo_storage_key"
    ))
