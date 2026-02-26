"""Add id column to role_profiles (non-primary)

Revision ID: 023
Revises: 022
Create Date: 2026-02-25
"""
from alembic import op


revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade():
    # 1️⃣ Add id column if it doesn't exist
    op.execute("""
        ALTER TABLE role_profiles
        ADD COLUMN IF NOT EXISTS id BIGSERIAL
    """)

    # 2️⃣ Ensure it has a unique constraint (but NOT primary key)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_role_profiles_id'
            ) THEN
                ALTER TABLE role_profiles
                ADD CONSTRAINT uq_role_profiles_id UNIQUE (id);
            END IF;
        END$$
    """)


def downgrade():
    op.execute("""
        ALTER TABLE role_profiles
        DROP CONSTRAINT IF EXISTS uq_role_profiles_id
    """)
    op.execute("""
        ALTER TABLE role_profiles
        DROP COLUMN IF EXISTS id
    """)
