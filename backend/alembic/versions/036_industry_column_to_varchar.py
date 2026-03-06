"""Convert industry column from enum to varchar

The database has an industry_enum type constraining the organizations.industry
column to a fixed set of values. The SQLAlchemy model defines it as String(255).
This migration aligns the DB with the model so arbitrary industry values work.

Revision ID: 036
Revises: 035
"""

from alembic import op

revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None


def upgrade():
    # Convert the column from enum to varchar (table is "orgs", not "organizations")
    op.execute(
        "ALTER TABLE orgs "
        "ALTER COLUMN industry TYPE VARCHAR(255) USING industry::text"
    )
    # Drop the enum type if it exists
    op.execute("DROP TYPE IF EXISTS industry_enum")


def downgrade():
    # Re-create the enum (with the original values) and convert back
    op.execute(
        "CREATE TYPE industry_enum AS ENUM ("
        "'technology','finance','healthcare','education','government',"
        "'ngo','manufacturing','retail','hospitality','agriculture','other')"
    )
    op.execute(
        "ALTER TABLE orgs "
        "ALTER COLUMN industry TYPE industry_enum USING industry::industry_enum"
    )
