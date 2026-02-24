"""Add manager to user_role_enum (retry after 016 failed inside transaction)

Revision ID: 017
Revises: 016
Create Date: 2026-02-24
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "017"
down_revision: Union[str, None] = "016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ADD VALUE must run outside a transaction in PostgreSQL.
    conn = op.get_bind()
    conn.execute(sa.text("COMMIT"))
    conn.execute(sa.text("ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'manager'"))


def downgrade() -> None:
    pass  # PostgreSQL does not support removing enum values
