"""add payroll statutory config versioning

Revision ID: 042_payroll_statutory_versioning
Revises: 041_roadmap_modules
Create Date: 2026-03-13 14:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "042_payroll_statutory_versioning"
down_revision = "041"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("payroll_statutory_configs", sa.Column("effective_from", sa.Date(), nullable=True))
    op.add_column("payroll_statutory_configs", sa.Column("effective_to", sa.Date(), nullable=True))
    op.add_column(
        "payroll_statutory_configs",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column("payroll_statutory_configs", sa.Column("notes", sa.Text(), nullable=True))
    op.execute(
        """
        ALTER TABLE payroll_statutory_configs
        DROP CONSTRAINT IF EXISTS payroll_statutory_configs_org_id_key
        """
    )


def downgrade():
    op.execute(
        """
        ALTER TABLE payroll_statutory_configs
        ADD CONSTRAINT payroll_statutory_configs_org_id_key UNIQUE (org_id)
        """
    )
    op.drop_column("payroll_statutory_configs", "notes")
    op.drop_column("payroll_statutory_configs", "is_active")
    op.drop_column("payroll_statutory_configs", "effective_to")
    op.drop_column("payroll_statutory_configs", "effective_from")
