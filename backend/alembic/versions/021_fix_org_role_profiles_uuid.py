"""Fix org_profiles and role_profiles org_id columns from INTEGER to UUID

Revision ID: 021
Revises: 020
Create Date: 2026-02-25
"""
from alembic import op

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade():
    # ── org_profiles ──────────────────────────────────────────────────
    # Delete existing rows (integer org_ids can't map to real UUID orgs)
    op.execute("DELETE FROM org_profiles")
    op.execute("DROP INDEX IF EXISTS ix_org_profiles_org_id")
    op.execute("ALTER TABLE org_profiles DROP CONSTRAINT IF EXISTS org_profiles_org_id_key")

    # Drop column and re-add as UUID
    op.execute("ALTER TABLE org_profiles DROP COLUMN org_id")
    op.execute("""
        ALTER TABLE org_profiles
            ADD COLUMN org_id UUID NOT NULL DEFAULT gen_random_uuid()
    """)
    # Remove the default — callers must supply the value
    op.execute("ALTER TABLE org_profiles ALTER COLUMN org_id DROP DEFAULT")
    op.execute("CREATE UNIQUE INDEX ix_org_profiles_org_id ON org_profiles (org_id)")

    # ── role_profiles ─────────────────────────────────────────────────
    op.execute("DELETE FROM role_profiles")
    op.execute("DROP INDEX IF EXISTS ix_role_profiles_org_id")
    op.execute("ALTER TABLE role_profiles DROP CONSTRAINT IF EXISTS uq_org_role_key")

    op.execute("ALTER TABLE role_profiles DROP COLUMN org_id")
    op.execute("""
        ALTER TABLE role_profiles
            ADD COLUMN org_id UUID NOT NULL DEFAULT gen_random_uuid()
    """)
    op.execute("ALTER TABLE role_profiles ALTER COLUMN org_id DROP DEFAULT")
    op.execute("CREATE INDEX ix_role_profiles_org_id ON role_profiles (org_id)")
    op.execute("""
        ALTER TABLE role_profiles
            ADD CONSTRAINT uq_org_role_key UNIQUE (org_id, role_key)
    """)


def downgrade():
    pass
