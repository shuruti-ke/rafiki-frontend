"""Adaptive Guided Paths — org profiles, role profiles, session adaptation columns

Revision ID: 007
Revises: 006
Create Date: 2026-02-16
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- guided_modules (create if not already present) ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS guided_modules (
            id SERIAL PRIMARY KEY,
            org_id INTEGER,
            name VARCHAR(300) NOT NULL,
            category VARCHAR(100) NOT NULL,
            description TEXT,
            duration_minutes INTEGER NOT NULL DEFAULT 10,
            icon VARCHAR(50) DEFAULT 'brain',
            steps JSONB NOT NULL DEFAULT '[]'::jsonb,
            triggers JSONB DEFAULT '[]'::jsonb,
            safety_checks JSONB DEFAULT '[]'::jsonb,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_guided_modules_org_id ON guided_modules (org_id)")

    # --- guided_path_sessions (create if not already present) ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS guided_path_sessions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            org_id INTEGER NOT NULL,
            module_id INTEGER NOT NULL,
            current_step INTEGER NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
            started_at TIMESTAMPTZ DEFAULT now(),
            completed_at TIMESTAMPTZ,
            responses JSONB DEFAULT '[]'::jsonb
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_gps_user_id ON guided_path_sessions (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gps_org_id ON guided_path_sessions (org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gps_module_id ON guided_path_sessions (module_id)")

    # --- Add new adaptive columns to guided_path_sessions ---
    op.execute("ALTER TABLE guided_path_sessions ADD COLUMN IF NOT EXISTS composed_steps JSONB")
    op.execute("ALTER TABLE guided_path_sessions ADD COLUMN IF NOT EXISTS context_pack JSONB")
    op.execute("ALTER TABLE guided_path_sessions ADD COLUMN IF NOT EXISTS pre_rating INTEGER")
    op.execute("ALTER TABLE guided_path_sessions ADD COLUMN IF NOT EXISTS post_rating INTEGER")
    op.execute("ALTER TABLE guided_path_sessions ADD COLUMN IF NOT EXISTS theme_category VARCHAR(50)")
    op.execute("ALTER TABLE guided_path_sessions ADD COLUMN IF NOT EXISTS available_time INTEGER")

    # --- org_profiles ---
    op.create_table(
        "org_profiles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("org_id", sa.Integer(), nullable=False, unique=True, index=True),
        sa.Column("org_purpose", sa.String(300), nullable=True),
        sa.Column("industry", sa.String(100), nullable=True),
        sa.Column("work_environment", sa.String(50), nullable=True),
        sa.Column("benefits_tags", postgresql.JSONB(), nullable=True, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # --- role_profiles ---
    op.create_table(
        "role_profiles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("org_id", sa.Integer(), nullable=False, index=True),
        sa.Column("role_key", sa.String(100), nullable=False),
        sa.Column("role_family", sa.String(100), nullable=True),
        sa.Column("seniority_band", sa.String(50), nullable=True),
        sa.Column("work_pattern", sa.String(50), nullable=True),
        sa.Column("stressor_profile", postgresql.JSONB(), nullable=True, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("org_id", "role_key", name="uq_org_role_key"),
    )


def downgrade() -> None:
    op.drop_table("role_profiles")
    op.drop_table("org_profiles")
    op.execute("ALTER TABLE guided_path_sessions DROP COLUMN IF EXISTS composed_steps")
    op.execute("ALTER TABLE guided_path_sessions DROP COLUMN IF EXISTS context_pack")
    op.execute("ALTER TABLE guided_path_sessions DROP COLUMN IF EXISTS pre_rating")
    op.execute("ALTER TABLE guided_path_sessions DROP COLUMN IF EXISTS post_rating")
    op.execute("ALTER TABLE guided_path_sessions DROP COLUMN IF EXISTS theme_category")
    op.execute("ALTER TABLE guided_path_sessions DROP COLUMN IF EXISTS available_time")
