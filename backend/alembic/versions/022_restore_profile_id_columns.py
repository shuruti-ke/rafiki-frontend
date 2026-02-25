"""Restore id columns on org_profiles and role_profiles lost in migration 021

Revision ID: 022
Revises: 021
Create Date: 2026-02-25
"""
from alembic import op

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade():
    # role_profiles lost its id SERIAL PRIMARY KEY when org_id was dropped/re-added
    # Add it back (table is empty after migration 021 so no conflict)
    op.execute("""
        ALTER TABLE role_profiles
            ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY
    """)

    # org_profiles uses org_id as its PK (no separate id column in the model)
    # but ensure it has a primary key set
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = 'org_profiles'::regclass
                AND contype = 'p'
            ) THEN
                ALTER TABLE org_profiles ADD PRIMARY KEY (org_id);
            END IF;
        END$$
    """)


def downgrade():
    pass
