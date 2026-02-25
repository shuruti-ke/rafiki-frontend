"""Fix role_profiles: drop existing PK constraint then add id SERIAL PRIMARY KEY

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
    # Drop whatever primary key currently exists on role_profiles
    op.execute("""
        DO $$
        DECLARE
            pk_name text;
        BEGIN
            SELECT conname INTO pk_name
            FROM pg_constraint
            WHERE conrelid = 'role_profiles'::regclass AND contype = 'p';
            IF pk_name IS NOT NULL THEN
                EXECUTE 'ALTER TABLE role_profiles DROP CONSTRAINT ' || quote_ident(pk_name);
            END IF;
        END$$
    """)

    # Now add id SERIAL PRIMARY KEY
    op.execute("ALTER TABLE role_profiles ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY")


def downgrade():
    pass
