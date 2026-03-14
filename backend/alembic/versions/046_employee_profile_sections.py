"""Employee profile sections: dependents, work experience, education, assets; profile marital_status

Revision ID: 046_employee_profile_sections
Revises: 045_payroll_run_adjustments
Create Date: 2026-03-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "046_employee_profile_sections"
down_revision = "045_payroll_run_adjustments"
branch_labels = None
depends_on = None


def upgrade():
    # Add columns to employee_profiles
    op.add_column("employee_profiles", sa.Column("marital_status", sa.String(50), nullable=True))
    op.add_column("employee_profiles", sa.Column("number_of_dependents", sa.Integer(), nullable=True))

    # employee_dependents
    op.create_table(
        "employee_dependents",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("contact_type", sa.String(50), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("relationship", sa.String(100), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users_legacy.user_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.org_id"], ondelete="CASCADE"),
    )
    op.create_index("ix_employee_dependents_user_id", "employee_dependents", ["user_id"])
    op.create_index("ix_employee_dependents_org_id", "employee_dependents", ["org_id"])

    # employee_work_experience
    op.create_table(
        "employee_work_experience",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employer_name", sa.String(255), nullable=False),
        sa.Column("job_title", sa.String(200), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("is_current", sa.String(10), nullable=True),
        sa.Column("responsibilities", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users_legacy.user_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.org_id"], ondelete="CASCADE"),
    )
    op.create_index("ix_employee_work_experience_user_id", "employee_work_experience", ["user_id"])
    op.create_index("ix_employee_work_experience_org_id", "employee_work_experience", ["org_id"])

    # employee_education
    op.create_table(
        "employee_education",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("institution", sa.String(255), nullable=False),
        sa.Column("qualification", sa.String(200), nullable=True),
        sa.Column("field_of_study", sa.String(200), nullable=True),
        sa.Column("year_completed", sa.Integer(), nullable=True),
        sa.Column("is_certification", sa.String(10), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users_legacy.user_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.org_id"], ondelete="CASCADE"),
    )
    op.create_index("ix_employee_education_user_id", "employee_education", ["user_id"])
    op.create_index("ix_employee_education_org_id", "employee_education", ["org_id"])

    # employee_assets
    op.create_table(
        "employee_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("asset_type", sa.String(100), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("serial_number", sa.String(120), nullable=True),
        sa.Column("assigned_date", sa.Date(), nullable=True),
        sa.Column("returned_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users_legacy.user_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.org_id"], ondelete="CASCADE"),
    )
    op.create_index("ix_employee_assets_user_id", "employee_assets", ["user_id"])
    op.create_index("ix_employee_assets_org_id", "employee_assets", ["org_id"])


def downgrade():
    op.drop_table("employee_assets")
    op.drop_table("employee_education")
    op.drop_table("employee_work_experience")
    op.drop_table("employee_dependents")
    op.drop_column("employee_profiles", "number_of_dependents")
    op.drop_column("employee_profiles", "marital_status")
