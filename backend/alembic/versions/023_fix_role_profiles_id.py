"""Keep role_profiles composite PK, do NOT add id primary key

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
    # ✅ Do nothing: role_profiles already has a valid composite PK (org_id, role_key)
    # and your SQLAlchemy model expects that.
    #
    # If you want to ensure the unique constraint exists (optional), uncomment:
    #
    # op.execute("""
    #     DO $$
    #     BEGIN
    #         IF NOT EXISTS (
    #             SELECT 1 FROM pg_constraint
    #             WHERE conname = 'uq_org_role_key'
    #         ) THEN
    #             ALTER TABLE role_profiles
    #             ADD CONSTRAINT uq_org_role_key UNIQUE (org_id, role_key);
    #         END IF;
    #     END $$;
    # """)

    pass


def downgrade():
    pass
