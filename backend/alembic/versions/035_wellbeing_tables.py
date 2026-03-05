"""Add wellbeing tables: crisis_alerts, chat_analytics, org_crisis_configs

Revision ID: 035
Revises: 034
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "035"
down_revision = "034"
branch_labels = None
depends_on = None


def upgrade():
    # crisis_alerts
    op.create_table(
        "crisis_alerts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", UUID(as_uuid=True), nullable=True),
        sa.Column("risk_level", sa.String(20), nullable=False),
        sa.Column("trigger_text", sa.Text(), nullable=True),
        sa.Column("detected_patterns", JSONB(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("acknowledged_by", UUID(as_uuid=True), nullable=True),
        sa.Column("resolved_by", UUID(as_uuid=True), nullable=True),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_crisis_alerts_org_created", "crisis_alerts", ["org_id", "created_at"])
    op.create_index("ix_crisis_alerts_user_created", "crisis_alerts", ["user_id", "created_at"])
    op.create_index("ix_crisis_alerts_org_status", "crisis_alerts", ["org_id", "status"])

    # chat_analytics
    op.create_table(
        "chat_analytics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("session_id", UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False),
        sa.Column("message_text", sa.Text(), nullable=True),
        sa.Column("stress_level", sa.Integer(), nullable=True),
        sa.Column("sentiment", sa.Float(), nullable=True),
        sa.Column("sentiment_label", sa.String(20), nullable=True),
        sa.Column("topics", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_chat_analytics_org_created", "chat_analytics", ["org_id", "created_at"])
    op.create_index("ix_chat_analytics_user_created", "chat_analytics", ["user_id", "created_at"])

    # org_crisis_configs
    op.create_table(
        "org_crisis_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("crisis_contacts", JSONB(), nullable=True),
        sa.Column("custom_helplines", JSONB(), nullable=True),
        sa.Column("auto_alert_managers", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("auto_alert_hr", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("org_crisis_configs")
    op.drop_table("chat_analytics")
    op.drop_table("crisis_alerts")
