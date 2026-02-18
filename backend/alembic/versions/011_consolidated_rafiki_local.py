"""Consolidated rafiki-local migration — all tables from 006, 007, 008

Revision ID: 011
Revises: 010
Create Date: 2026-02-17

This single migration replaces the separate 006/007/008 migrations.
It chains from revision '010' (the last migration in the rafiki-backend DB).
All DDL uses IF NOT EXISTS so it's safe to run on a DB that already has
some or all of these tables from earlier deployments.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ===== From 006: HR Portal tables =====

    op.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id SERIAL PRIMARY KEY,
            org_id INTEGER NOT NULL,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            file_path VARCHAR(1000) NOT NULL,
            original_filename VARCHAR(500) NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            file_size INTEGER NOT NULL,
            category VARCHAR(50) NOT NULL DEFAULT 'general',
            tags JSONB DEFAULT '[]'::jsonb,
            version INTEGER NOT NULL DEFAULT 1,
            parent_id INTEGER REFERENCES documents(id),
            is_current BOOLEAN NOT NULL DEFAULT TRUE,
            is_indexed BOOLEAN NOT NULL DEFAULT FALSE,
            uploaded_by INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_documents_org_id ON documents (org_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS document_chunks (
            id SERIAL PRIMARY KEY,
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            org_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            token_count INTEGER,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_document_id ON document_chunks (document_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_org_id ON document_chunks (org_id)")
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_document_chunks_fts
        ON document_chunks USING GIN (to_tsvector('english', content))
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS announcements (
            id SERIAL PRIMARY KEY,
            org_id INTEGER NOT NULL,
            title VARCHAR(500) NOT NULL,
            content TEXT NOT NULL,
            is_training BOOLEAN NOT NULL DEFAULT FALSE,
            target_departments JSONB DEFAULT '[]'::jsonb,
            target_roles JSONB DEFAULT '[]'::jsonb,
            priority VARCHAR(20) NOT NULL DEFAULT 'normal',
            published_at TIMESTAMPTZ,
            expires_at TIMESTAMPTZ,
            created_by INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcements_org_id ON announcements (org_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS announcement_reads (
            id SERIAL PRIMARY KEY,
            announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL,
            read_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_announcement_read_user UNIQUE (announcement_id, user_id)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS training_assignments (
            id SERIAL PRIMARY KEY,
            announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL,
            assigned_by INTEGER NOT NULL,
            due_date TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_training_assignment_user UNIQUE (announcement_id, user_id)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS employee_documents (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            org_id INTEGER NOT NULL,
            doc_type VARCHAR(50) NOT NULL,
            title VARCHAR(500) NOT NULL,
            file_path VARCHAR(1000) NOT NULL,
            original_filename VARCHAR(500) NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            file_size INTEGER NOT NULL,
            uploaded_by INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_employee_documents_user_id ON employee_documents (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_employee_documents_org_id ON employee_documents (org_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS performance_evaluations (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            org_id INTEGER NOT NULL,
            evaluation_period VARCHAR(100) NOT NULL,
            evaluator_id INTEGER NOT NULL,
            overall_rating INTEGER NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
            strengths TEXT,
            areas_for_improvement TEXT,
            goals_for_next_period TEXT,
            comments TEXT,
            objective_ids JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_performance_evaluations_user_id ON performance_evaluations (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_performance_evaluations_org_id ON performance_evaluations (org_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS disciplinary_records (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            org_id INTEGER NOT NULL,
            record_type VARCHAR(50) NOT NULL,
            description TEXT NOT NULL,
            date_of_incident DATE NOT NULL,
            recorded_by INTEGER NOT NULL,
            witnesses JSONB DEFAULT '[]'::jsonb,
            outcome TEXT,
            attachments JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_disciplinary_records_user_id ON disciplinary_records (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_disciplinary_records_org_id ON disciplinary_records (org_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id SERIAL PRIMARY KEY,
            org_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            action VARCHAR(100) NOT NULL,
            resource_type VARCHAR(100) NOT NULL,
            resource_id INTEGER,
            details JSONB,
            ip_address VARCHAR(45),
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_log_org_id ON audit_log (org_id)")

    # ===== From 007: Adaptive Guided Paths =====

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

    # Adaptive columns (safe to run if they already exist)
    op.execute("ALTER TABLE guided_path_sessions ADD COLUMN IF NOT EXISTS composed_steps JSONB")
    op.execute("ALTER TABLE guided_path_sessions ADD COLUMN IF NOT EXISTS context_pack JSONB")
    op.execute("ALTER TABLE guided_path_sessions ADD COLUMN IF NOT EXISTS pre_rating INTEGER")
    op.execute("ALTER TABLE guided_path_sessions ADD COLUMN IF NOT EXISTS post_rating INTEGER")
    op.execute("ALTER TABLE guided_path_sessions ADD COLUMN IF NOT EXISTS theme_category VARCHAR(50)")
    op.execute("ALTER TABLE guided_path_sessions ADD COLUMN IF NOT EXISTS available_time INTEGER")

    op.execute("""
        CREATE TABLE IF NOT EXISTS org_profiles (
            id SERIAL PRIMARY KEY,
            org_id INTEGER NOT NULL UNIQUE,
            org_purpose VARCHAR(300),
            industry VARCHAR(100),
            work_environment VARCHAR(50),
            benefits_tags JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_org_profiles_org_id ON org_profiles (org_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS role_profiles (
            id SERIAL PRIMARY KEY,
            org_id INTEGER NOT NULL,
            role_key VARCHAR(100) NOT NULL,
            role_family VARCHAR(100),
            seniority_band VARCHAR(50),
            work_pattern VARCHAR(50),
            stressor_profile JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_org_role_key UNIQUE (org_id, role_key)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_role_profiles_org_id ON role_profiles (org_id)")

    # ===== From 008: Manager Toolkit =====

    op.execute("""
        CREATE TABLE IF NOT EXISTS manager_configs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE,
            org_id INTEGER NOT NULL,
            org_member_id INTEGER,
            manager_level VARCHAR(10) NOT NULL DEFAULT 'L1',
            allowed_data_types JSONB DEFAULT '[]'::jsonb,
            allowed_features JSONB DEFAULT '[]'::jsonb,
            department_scope JSONB DEFAULT '[]'::jsonb,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_manager_configs_user_id ON manager_configs (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_manager_configs_org_id ON manager_configs (org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_manager_configs_org_member_id ON manager_configs (org_member_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS toolkit_modules (
            id SERIAL PRIMARY KEY,
            org_id INTEGER,
            category VARCHAR(50) NOT NULL,
            title VARCHAR(300) NOT NULL,
            content JSONB NOT NULL DEFAULT '{}'::jsonb,
            version INTEGER NOT NULL DEFAULT 1,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            language VARCHAR(10) NOT NULL DEFAULT 'en',
            created_by INTEGER,
            approved_by VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_toolkit_modules_org_id ON toolkit_modules (org_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS coaching_sessions (
            id SERIAL PRIMARY KEY,
            manager_id INTEGER NOT NULL,
            org_id INTEGER NOT NULL,
            employee_member_id INTEGER NOT NULL,
            employee_name VARCHAR(255),
            concern TEXT NOT NULL,
            context_used JSONB,
            ai_response TEXT,
            structured_response JSONB,
            outcome_logged VARCHAR(20),
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_coaching_sessions_manager_id ON coaching_sessions (manager_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_coaching_sessions_org_id ON coaching_sessions (org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_coaching_sessions_employee_member_id ON coaching_sessions (employee_member_id)")


def downgrade() -> None:
    # Manager Toolkit
    op.execute("DROP TABLE IF EXISTS coaching_sessions")
    op.execute("DROP TABLE IF EXISTS toolkit_modules")
    op.execute("DROP TABLE IF EXISTS manager_configs")

    # Adaptive Guided Paths
    op.execute("DROP TABLE IF EXISTS role_profiles")
    op.execute("DROP TABLE IF EXISTS org_profiles")
    op.execute("ALTER TABLE guided_path_sessions DROP COLUMN IF EXISTS composed_steps")
    op.execute("ALTER TABLE guided_path_sessions DROP COLUMN IF EXISTS context_pack")
    op.execute("ALTER TABLE guided_path_sessions DROP COLUMN IF EXISTS pre_rating")
    op.execute("ALTER TABLE guided_path_sessions DROP COLUMN IF EXISTS post_rating")
    op.execute("ALTER TABLE guided_path_sessions DROP COLUMN IF EXISTS theme_category")
    op.execute("ALTER TABLE guided_path_sessions DROP COLUMN IF EXISTS available_time")
    op.execute("DROP TABLE IF EXISTS guided_path_sessions")
    op.execute("DROP TABLE IF EXISTS guided_modules")

    # HR Portal
    op.execute("DROP TABLE IF EXISTS audit_log")
    op.execute("DROP TABLE IF EXISTS disciplinary_records")
    op.execute("DROP TABLE IF EXISTS performance_evaluations")
    op.execute("DROP TABLE IF EXISTS employee_documents")
    op.execute("DROP TABLE IF EXISTS training_assignments")
    op.execute("DROP TABLE IF EXISTS announcement_reads")
    op.execute("DROP TABLE IF EXISTS announcements")
    op.execute("DROP INDEX IF EXISTS idx_document_chunks_fts")
    op.execute("DROP TABLE IF EXISTS document_chunks")
    op.execute("DROP TABLE IF EXISTS documents")
