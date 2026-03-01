"""Make calendar_events.date nullable

Revision ID: 032
Revises: 031
Create Date: 2026-02-28
"""

from alembic import op

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE calendar_events ALTER COLUMN date DROP NOT NULL;")


def downgrade():
    op.execute("UPDATE calendar_events SET date = '' WHERE date IS NULL;")
    op.execute("ALTER TABLE calendar_events ALTER COLUMN date SET NOT NULL;")
