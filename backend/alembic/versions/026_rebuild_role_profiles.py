"""Rebuild role_profiles table with correct schema (composite PK on org_id+role_key)

Revision ID: 026
Revises: 025
Create Date: 2026-02-26
"""
from alembic import op

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        DO $$
        BEGIN
            -- Save any existing rows (table may be empty; org_id may already be UUID)
            CREATE TEMP TABLE IF NOT EXISTS role_profiles_backup AS
                SELECT org_id::text, role_key, role_family, seniority_band, work_pattern,
                       stressor_profile, created_at, updated_at
                FROM role_profiles
                WHERE role_key IS NOT NULL;

            -- Drop and recreate the table cleanly
            DROP TABLE role_profiles CASCADE;

            CREATE TABLE role_profiles (
                org_id      UUID        NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
                role_key    VARCHAR(100) NOT NULL,
                role_family VARCHAR(100),
                seniority_band VARCHAR(50),
                work_pattern   VARCHAR(50),
                stressor_profile JSONB DEFAULT '[]'::jsonb,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (org_id, role_key)
            );

            CREATE INDEX ix_role_profiles_org_id ON role_profiles (org_id);

            -- Restore rows whose org_id is a valid UUID referencing orgs
            INSERT INTO role_profiles (org_id, role_key, role_family, seniority_band,
                                       work_pattern, stressor_profile, created_at, updated_at)
            SELECT b.org_id::uuid, b.role_key, b.role_family, b.seniority_band,
                   b.work_pattern, b.stressor_profile, b.created_at, b.updated_at
            FROM role_profiles_backup b
            JOIN orgs o ON o.org_id = b.org_id::uuid
            ON CONFLICT DO NOTHING;

            DROP TABLE IF EXISTS role_profiles_backup;
        END$$
    """)


def downgrade():
    pass
