"""Add billing_services, billing_invoices, billing_invoice_line_items

Revision ID: 038
Revises: 037
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "038"
down_revision = "037"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "billing_services",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="KES"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_billing_services_org_id", "billing_services", ["org_id"])

    op.create_table(
        "billing_invoices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("invoice_number", sa.String(50), nullable=False),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="KES"),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("purpose", sa.String(100), nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("description_json", JSONB(), nullable=True),
        sa.Column("created_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_billing_invoices_org_id", "billing_invoices", ["org_id"])
    op.create_index("ix_billing_invoices_user_id", "billing_invoices", ["user_id"])
    op.create_index("ix_billing_invoices_invoice_number", "billing_invoices", ["invoice_number"])

    op.create_table(
        "billing_invoice_line_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("billing_invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("service_id", UUID(as_uuid=True), sa.ForeignKey("billing_services.id", ondelete="SET NULL"), nullable=True),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 2), nullable=False, server_default="1"),
        sa.Column("unit_price_minor", sa.Integer(), nullable=False),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
    )
    op.create_index("ix_billing_invoice_line_items_invoice_id", "billing_invoice_line_items", ["invoice_id"])


def downgrade():
    op.drop_table("billing_invoice_line_items")
    op.drop_table("billing_invoices")
    op.drop_table("billing_services")
