"""Placeholder for rafiki-backend revision 010

Revision ID: 010
Revises: None
Create Date: 2026-02-17

This is a no-op stub. The real 010 migration lives in the older
rafiki-backend project and was already applied to the Render DB.
We include this so alembic can resolve the chain: 010 -> 011.
"""
from typing import Sequence, Union

revision: str = "010"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
