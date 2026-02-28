"""Add visibility column to employee_documents

Revision ID: 029
Revises: 028
Create Date: 2026-02-27
"""
from alembic import op

revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE employee_documents
            ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'private';
    """)


def downgrade():
    op.execute("ALTER TABLE employee_documents DROP COLUMN IF EXISTS visibility;")
