"""Fix calendar_events id default to gen_random_uuid()

Revision ID: 031
Revises: 030
Create Date: 2026-02-28
"""

from alembic import op

revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE calendar_events ALTER COLUMN id SET DEFAULT gen_random_uuid();")


def downgrade():
    op.execute("ALTER TABLE calendar_events ALTER COLUMN id DROP DEFAULT;")
