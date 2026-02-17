"""Manager & Leadership Toolkit — manager_configs, toolkit_modules, coaching_sessions

Revision ID: 008
Revises: 007
Create Date: 2026-02-17
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- manager_configs ---
    op.create_table(
        "manager_configs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False, unique=True),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("org_member_id", sa.Integer(), nullable=True),
        sa.Column("manager_level", sa.String(10), nullable=False, server_default="L1"),
        sa.Column("allowed_data_types", postgresql.JSONB(), nullable=True, server_default="[]"),
        sa.Column("allowed_features", postgresql.JSONB(), nullable=True, server_default="[]"),
        sa.Column("department_scope", postgresql.JSONB(), nullable=True, server_default="[]"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_manager_configs_user_id", "manager_configs", ["user_id"])
    op.create_index("ix_manager_configs_org_id", "manager_configs", ["org_id"])
    op.create_index("ix_manager_configs_org_member_id", "manager_configs", ["org_member_id"])

    # --- toolkit_modules ---
    op.create_table(
        "toolkit_modules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("content", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("language", sa.String(10), nullable=False, server_default="'en'"),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("approved_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_toolkit_modules_org_id", "toolkit_modules", ["org_id"])

    # --- coaching_sessions ---
    op.create_table(
        "coaching_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("manager_id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("employee_member_id", sa.Integer(), nullable=False),
        sa.Column("employee_name", sa.String(255), nullable=True),
        sa.Column("concern", sa.Text(), nullable=False),
        sa.Column("context_used", postgresql.JSONB(), nullable=True),
        sa.Column("ai_response", sa.Text(), nullable=True),
        sa.Column("structured_response", postgresql.JSONB(), nullable=True),
        sa.Column("outcome_logged", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_coaching_sessions_manager_id", "coaching_sessions", ["manager_id"])
    op.create_index("ix_coaching_sessions_org_id", "coaching_sessions", ["org_id"])
    op.create_index("ix_coaching_sessions_employee_member_id", "coaching_sessions", ["employee_member_id"])


def downgrade() -> None:
    op.drop_table("coaching_sessions")
    op.drop_table("toolkit_modules")
    op.drop_table("manager_configs")
