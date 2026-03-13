"""add monthly_salary to employee_profiles for auto payroll

Revision ID: 044_employee_monthly_salary
Revises: 043_payroll_permissions
Create Date: 2026-03-13 22:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "044_employee_monthly_salary"
down_revision = "043_payroll_permissions"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "employee_profiles",
        sa.Column("monthly_salary", sa.Numeric(12, 2), nullable=True),
    )


def downgrade():
    op.drop_column("employee_profiles", "monthly_salary")
