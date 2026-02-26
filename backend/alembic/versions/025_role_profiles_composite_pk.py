"""Set role_profiles to use composite PK (org_id, role_key), drop id column

Revision ID: 025
Revises: 024
Create Date: 2026-02-25
"""
from alembic import op

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        DO $$
        DECLARE
            pk_name text;
        BEGIN
            -- Drop any existing primary key
            SELECT conname INTO pk_name
            FROM pg_constraint
            WHERE conrelid = 'role_profiles'::regclass AND contype = 'p';

            IF pk_name IS NOT NULL THEN
                EXECUTE 'ALTER TABLE role_profiles DROP CONSTRAINT ' || quote_ident(pk_name);
            END IF;

            -- Drop id column if it exists (no longer needed)
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'role_profiles' AND column_name = 'id'
            ) THEN
                ALTER TABLE role_profiles DROP COLUMN id;
            END IF;

            -- Drop the old unique constraint if it still exists
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = 'role_profiles'::regclass
                AND conname = 'uq_org_role_key'
            ) THEN
                ALTER TABLE role_profiles DROP CONSTRAINT uq_org_role_key;
            END IF;

            -- Add composite primary key
            ALTER TABLE role_profiles ADD PRIMARY KEY (org_id, role_key);
        END$$
    """)


def downgrade():
    pass
