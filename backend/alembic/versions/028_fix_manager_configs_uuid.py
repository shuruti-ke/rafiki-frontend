"""Fix manager_configs: convert user_id, org_id, org_member_id from INTEGER to UUID

Revision ID: 028
Revises: 027
Create Date: 2026-02-26
"""
from alembic import op

revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        DO $$
        BEGIN
            -- Drop existing indexes and constraints
            DROP INDEX IF EXISTS ix_manager_configs_user_id;
            DROP INDEX IF EXISTS ix_manager_configs_org_id;
            DROP INDEX IF EXISTS ix_manager_configs_org_member_id;

            -- Drop unique constraint on user_id if exists
            ALTER TABLE manager_configs DROP CONSTRAINT IF EXISTS manager_configs_user_id_key;
            ALTER TABLE manager_configs DROP CONSTRAINT IF EXISTS uq_manager_configs_user_id;

            -- Clear rows — integer user_ids can't map to UUID users
            DELETE FROM manager_configs;

            -- Convert columns
            ALTER TABLE manager_configs
                ALTER COLUMN user_id TYPE UUID USING NULL,
                ALTER COLUMN org_id TYPE UUID USING NULL,
                ALTER COLUMN org_member_id TYPE UUID USING NULL;

            -- Restore NOT NULL where needed
            ALTER TABLE manager_configs ALTER COLUMN user_id SET NOT NULL;
            ALTER TABLE manager_configs ALTER COLUMN org_id SET NOT NULL;

            -- Recreate unique constraint and indexes
            ALTER TABLE manager_configs ADD CONSTRAINT manager_configs_user_id_key UNIQUE (user_id);
            CREATE INDEX ix_manager_configs_user_id ON manager_configs (user_id);
            CREATE INDEX ix_manager_configs_org_id ON manager_configs (org_id);
            CREATE INDEX ix_manager_configs_org_member_id ON manager_configs (org_member_id);
        END$$
    """)


def downgrade():
    pass
