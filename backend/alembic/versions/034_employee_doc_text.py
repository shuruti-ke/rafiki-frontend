"""Add extracted_text column to employee_documents

Revision ID: 034
Revises: 033
"""
from alembic import op
import sqlalchemy as sa

revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "employee_documents",
        sa.Column("extracted_text", sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_column("employee_documents", "extracted_text")
