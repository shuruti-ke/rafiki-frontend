"""Change users_legacy.role from enum to varchar

Revision ID: 018
Revises: 017
Create Date: 2026-02-24

Converts the role column from user_role_enum to VARCHAR(50) so new
role values like 'manager' don't require enum migrations.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE users_legacy ALTER COLUMN role TYPE VARCHAR(50) USING role::text"
    ))


def downgrade() -> None:
    # Restore enum (only safe if no rows contain 'manager')
    conn = op.get_bind()
    conn.execute(sa.text("COMMIT"))
    conn.execute(sa.text("ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'manager'"))
    op.execute(sa.text(
        "ALTER TABLE users_legacy ALTER COLUMN role TYPE user_role_enum USING role::user_role_enum"
    ))
