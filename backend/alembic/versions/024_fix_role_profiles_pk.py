"""Fix role_profiles primary key situation cleanly

Revision ID: 024
Revises: 023
Create Date: 2026-02-25
"""
from alembic import op

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        DO $$
        DECLARE
            pk_name text;
            col_exists boolean;
        BEGIN
            -- Check if id column already exists
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'role_profiles' AND column_name = 'id'
            ) INTO col_exists;

            IF col_exists THEN
                -- id column exists but may not be the PK — ensure it is
                -- Drop any existing PK first
                SELECT conname INTO pk_name
                FROM pg_constraint
                WHERE conrelid = 'role_profiles'::regclass AND contype = 'p';

                IF pk_name IS NOT NULL AND pk_name != 'role_profiles_pkey' THEN
                    EXECUTE 'ALTER TABLE role_profiles DROP CONSTRAINT ' || quote_ident(pk_name);
                    ALTER TABLE role_profiles ADD PRIMARY KEY (id);
                END IF;
                -- If pk_name = role_profiles_pkey it's already set on id, nothing to do
            ELSE
                -- id does not exist — drop any existing PK, then add id as PK
                SELECT conname INTO pk_name
                FROM pg_constraint
                WHERE conrelid = 'role_profiles'::regclass AND contype = 'p';

                IF pk_name IS NOT NULL THEN
                    EXECUTE 'ALTER TABLE role_profiles DROP CONSTRAINT ' || quote_ident(pk_name);
                END IF;

                ALTER TABLE role_profiles ADD COLUMN id SERIAL PRIMARY KEY;
            END IF;
        END$$
    """)


def downgrade():
    pass
