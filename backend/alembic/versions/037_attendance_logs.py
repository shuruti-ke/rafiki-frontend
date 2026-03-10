"""Add attendance_logs table for employee check-in/out tracking

Revision ID: 037
Revises: 036
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "037"
down_revision = "036"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "attendance_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("check_in", sa.DateTime(timezone=True), nullable=False),
        sa.Column("check_out", sa.DateTime(timezone=True), nullable=True),
        sa.Column("check_in_lat", sa.Numeric(9, 6), nullable=True),
        sa.Column("check_in_long", sa.Numeric(9, 6), nullable=True),
        sa.Column("check_in_accuracy", sa.Integer(), nullable=True),
        sa.Column("check_in_ip_address", sa.String(45), nullable=True),
        sa.Column("check_out_lat", sa.Numeric(9, 6), nullable=True),
        sa.Column("check_out_long", sa.Numeric(9, 6), nullable=True),
        sa.Column("check_out_accuracy", sa.Integer(), nullable=True),
        sa.Column("check_out_ip_address", sa.String(45), nullable=True),
        sa.Column("total_seconds", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_attendance_logs_user_id", "attendance_logs", ["user_id"])
    op.create_index("ix_attendance_logs_org_id", "attendance_logs", ["org_id"])
    op.create_index("ix_attendance_logs_work_date", "attendance_logs", ["work_date"])
    op.create_index("ix_attendance_logs_user_date", "attendance_logs", ["user_id", "work_date"])


def downgrade():
    op.drop_table("attendance_logs")
