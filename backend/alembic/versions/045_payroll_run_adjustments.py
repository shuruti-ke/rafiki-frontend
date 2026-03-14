"""payroll_run_adjustments for Thomas to edit pay before run (bonuses, deductions, pension, loans)

Revision ID: 045_payroll_run_adjustments
Revises: 044_employee_monthly_salary
Create Date: 2026-03-13 23:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "045_payroll_run_adjustments"
down_revision = "044_employee_monthly_salary"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "payroll_run_adjustments",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("period_year", sa.Integer(), nullable=False),
        sa.Column("period_month", sa.Integer(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("base_salary_override", sa.Numeric(12, 2), nullable=True),
        sa.Column("bonus", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("pension_optional", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("insurance_relief_basis", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("loan_repayment", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("other_deductions", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_payroll_run_adjustments_org_period_user",
        "payroll_run_adjustments",
        ["org_id", "period_year", "period_month", "user_id"],
        unique=True,
    )


def downgrade():
    op.drop_index("ix_payroll_run_adjustments_org_period_user", table_name="payroll_run_adjustments")
    op.drop_table("payroll_run_adjustments")
