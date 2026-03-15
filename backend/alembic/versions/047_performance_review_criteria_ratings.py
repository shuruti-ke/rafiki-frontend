"""Add criteria_ratings to performance_reviews_360 for template-based evaluations

Revision ID: 047_performance_review_criteria
Revises: 046_employee_profile_sections
Create Date: 2026-03-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "047_performance_review_criteria"
down_revision = "046_employee_profile_sections"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "performance_reviews_360",
        sa.Column("criteria_ratings", postgresql.JSONB(), nullable=True),
    )


def downgrade():
    op.drop_column("performance_reviews_360", "criteria_ratings")
