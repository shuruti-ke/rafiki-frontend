"""Add platform review recommendation schema updates.

Revision ID: 040
Revises: 039
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.dialects import postgresql

revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("employee_profiles", sa.Column("employment_type", sa.String(length=80), nullable=True))
    op.add_column("employee_profiles", sa.Column("work_location", sa.String(length=120), nullable=True))
    op.add_column("org_profiles", sa.Column("departments", postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    op.create_table(
        "leave_amendment_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("leave_application_id", UUID(as_uuid=True), sa.ForeignKey("leave_applications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("requested_start_date", sa.Date(), nullable=True),
        sa.Column("requested_end_date", sa.Date(), nullable=True),
        sa.Column("requested_working_days", sa.Float(), nullable=False, server_default="0"),
        sa.Column("requested_reason", sa.Text(), nullable=True),
        sa.Column("cancel_leave", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("half_day", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("half_day_period", sa.String(length=20), nullable=True),
        sa.Column("reviewed_by", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_leave_amendment_requests_app", "leave_amendment_requests", ["leave_application_id"])
    op.create_index("ix_leave_amendment_requests_org", "leave_amendment_requests", ["org_id"])
    op.create_index("ix_leave_amendment_requests_user", "leave_amendment_requests", ["user_id"])
    op.create_index("ix_leave_amendment_requests_status", "leave_amendment_requests", ["status"])


def downgrade():
    op.drop_index("ix_leave_amendment_requests_status", table_name="leave_amendment_requests")
    op.drop_index("ix_leave_amendment_requests_user", table_name="leave_amendment_requests")
    op.drop_index("ix_leave_amendment_requests_org", table_name="leave_amendment_requests")
    op.drop_index("ix_leave_amendment_requests_app", table_name="leave_amendment_requests")
    op.drop_table("leave_amendment_requests")
    op.drop_column("org_profiles", "departments")
    op.drop_column("employee_profiles", "work_location")
    op.drop_column("employee_profiles", "employment_type")
