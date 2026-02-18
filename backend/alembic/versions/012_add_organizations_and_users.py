"""Add organizations and users tables

Revision ID: 012
Revises: 011
Create Date: 2026-02-18

Adds the organizations table and a new auth-focused users table.
The existing legacy 'users' table (UUID-based, from the WhatsApp era)
is renamed to 'users_legacy' to preserve its data and FK relationships.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Rename the old UUID-based users table to users_legacy
    #    This preserves all data and FK constraints from the WhatsApp-era schema.
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users')
               AND EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name = 'users' AND column_name = 'user_id') THEN
                ALTER TABLE users RENAME TO users_legacy;
            END IF;
        END $$
    """)

    # 2. Create organizations table
    op.execute("""
        CREATE TABLE IF NOT EXISTS organizations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            code VARCHAR(50) NOT NULL UNIQUE,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_organizations_code ON organizations (code)")

    # 3. Create new auth-focused users table
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            full_name VARCHAR(200) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'employee',
            org_id INTEGER REFERENCES organizations(id),
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS users CASCADE")
    op.execute("DROP TABLE IF EXISTS organizations CASCADE")
    # Restore the legacy table name
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users_legacy') THEN
                ALTER TABLE users_legacy RENAME TO users;
            END IF;
        END $$
    """)
