"""Add billing_payments for receiving and receipting funds.

Revision ID: 039
Revises: 038
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "billing_payments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("billing_invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False),
        sa.Column("method", sa.String(20), nullable=False),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="KES"),
        sa.Column("reference", sa.String(100), nullable=True),
        sa.Column("attachment_storage_key", sa.String(500), nullable=True),
        sa.Column("attachment_original_name", sa.String(255), nullable=True),
        sa.Column("received_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_billing_payments_invoice_id", "billing_payments", ["invoice_id"])
    op.create_index("ix_billing_payments_org_id", "billing_payments", ["org_id"])


def downgrade():
    op.drop_table("billing_payments")
