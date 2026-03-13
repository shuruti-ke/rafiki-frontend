"""Add roadmap modules: shifts, 360 reviews, workflows, reports, statutory.

Revision ID: 041
Revises: 040
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "041"
down_revision = "040"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "shift_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("shift_type", sa.String(40), nullable=False, server_default="custom"),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("crosses_midnight", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_shift_templates_org", "shift_templates", ["org_id"])

    op.create_table(
        "shift_assignments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False),
        sa.Column("template_id", UUID(as_uuid=True), sa.ForeignKey("shift_templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("shift_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="assigned"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_shift_assignments_org_date", "shift_assignments", ["org_id", "shift_date"])
    op.create_index("ix_shift_assignments_user", "shift_assignments", ["user_id"])

    op.create_table(
        "shift_swap_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False),
        sa.Column("requester_user_id", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("requester_assignment_id", UUID(as_uuid=True), sa.ForeignKey("shift_assignments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_user_id", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_assignment_id", UUID(as_uuid=True), sa.ForeignKey("shift_assignments.id", ondelete="CASCADE"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("reviewed_by", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_shift_swap_requests_org", "shift_swap_requests", ["org_id"])
    op.create_index("ix_shift_swap_requests_status", "shift_swap_requests", ["status"])

    op.create_table(
        "performance_cycles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("template", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_performance_cycles_org", "performance_cycles", ["org_id"])

    op.create_table(
        "performance_reviews_360",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False),
        sa.Column("cycle_id", UUID(as_uuid=True), sa.ForeignKey("performance_cycles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_user_id", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer_user_id", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer_type", sa.String(30), nullable=False),
        sa.Column("rating", sa.Float(), nullable=True),
        sa.Column("feedback_text", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_perf_reviews_org_cycle", "performance_reviews_360", ["org_id", "cycle_id"])
    op.create_index("ix_perf_reviews_employee", "performance_reviews_360", ["employee_user_id"])

    op.create_table(
        "employee_workflows",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workflow_type", sa.String(20), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_employee_workflows_org_user", "employee_workflows", ["org_id", "user_id"])

    op.create_table(
        "employee_workflow_tasks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workflow_id", UUID(as_uuid=True), sa.ForeignKey("employee_workflows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(250), nullable=False),
        sa.Column("owner_type", sa.String(20), nullable=False, server_default="admin"),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("is_completed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("completed_by", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_employee_workflow_tasks_workflow", "employee_workflow_tasks", ["workflow_id"])

    op.create_table(
        "custom_reports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("config", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_custom_reports_org", "custom_reports", ["org_id"])

    op.create_table(
        "payroll_statutory_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("jurisdiction", sa.String(40), nullable=False, server_default="KE"),
        sa.Column("tax_bands", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("personal_relief", sa.Float(), nullable=False, server_default="2400"),
        sa.Column("insurance_relief_rate", sa.Float(), nullable=False, server_default="0.15"),
        sa.Column("insurance_relief_cap", sa.Float(), nullable=False, server_default="5000"),
        sa.Column("nssf_lower_limit", sa.Float(), nullable=False, server_default="9000"),
        sa.Column("nssf_upper_limit", sa.Float(), nullable=False, server_default="108000"),
        sa.Column("nssf_rate_tier1", sa.Float(), nullable=False, server_default="0.06"),
        sa.Column("nssf_rate_tier2", sa.Float(), nullable=False, server_default="0.06"),
        sa.Column("shif_rate", sa.Float(), nullable=False, server_default="0.0275"),
        sa.Column("ahl_rate", sa.Float(), nullable=False, server_default="0.015"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade():
    op.drop_table("payroll_statutory_configs")
    op.drop_index("ix_custom_reports_org", table_name="custom_reports")
    op.drop_table("custom_reports")
    op.drop_index("ix_employee_workflow_tasks_workflow", table_name="employee_workflow_tasks")
    op.drop_table("employee_workflow_tasks")
    op.drop_index("ix_employee_workflows_org_user", table_name="employee_workflows")
    op.drop_table("employee_workflows")
    op.drop_index("ix_perf_reviews_employee", table_name="performance_reviews_360")
    op.drop_index("ix_perf_reviews_org_cycle", table_name="performance_reviews_360")
    op.drop_table("performance_reviews_360")
    op.drop_index("ix_performance_cycles_org", table_name="performance_cycles")
    op.drop_table("performance_cycles")
    op.drop_index("ix_shift_swap_requests_status", table_name="shift_swap_requests")
    op.drop_index("ix_shift_swap_requests_org", table_name="shift_swap_requests")
    op.drop_table("shift_swap_requests")
    op.drop_index("ix_shift_assignments_user", table_name="shift_assignments")
    op.drop_index("ix_shift_assignments_org_date", table_name="shift_assignments")
    op.drop_table("shift_assignments")
    op.drop_index("ix_shift_templates_org", table_name="shift_templates")
    op.drop_table("shift_templates")
