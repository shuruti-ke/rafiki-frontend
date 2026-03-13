"""add payroll permissions flags on users_legacy

Revision ID: 043_payroll_permissions
Revises: 042_payroll_statutory_versioning
Create Date: 2026-03-13 21:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "043_payroll_permissions"
down_revision = "042_payroll_statutory_versioning"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users_legacy",
        sa.Column("can_process_payroll", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "users_legacy",
        sa.Column("can_approve_payroll", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "users_legacy",
        sa.Column("can_authorize_payroll", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade():
    op.drop_column("users_legacy", "can_authorize_payroll")
    op.drop_column("users_legacy", "can_approve_payroll")
    op.drop_column("users_legacy", "can_process_payroll")

