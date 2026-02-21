"""Add objectives, calendar, and messaging tables

Revision ID: 014
Revises: 013
Create Date: 2026-02-20

Idempotent -- uses IF NOT EXISTS.
"""
from typing import Sequence, Union
from alembic import op

revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Objectives ──
    op.execute("""
        CREATE TABLE IF NOT EXISTS objectives (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            user_id UUID NOT NULL,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            target_date DATE,
            status VARCHAR(50) NOT NULL DEFAULT 'draft',
            progress INTEGER NOT NULL DEFAULT 0,
            reviewed_by UUID,
            review_status VARCHAR(50),
            review_notes TEXT,
            reviewed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS key_results (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            objective_id UUID NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
            title VARCHAR(500) NOT NULL,
            target_value FLOAT NOT NULL DEFAULT 100,
            current_value FLOAT NOT NULL DEFAULT 0,
            unit VARCHAR(100) DEFAULT '%',
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)

    # ── Calendar ──
    op.execute("""
        CREATE TABLE IF NOT EXISTS calendar_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            user_id UUID NOT NULL,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            start_time TIMESTAMPTZ NOT NULL,
            end_time TIMESTAMPTZ,
            is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
            is_shared BOOLEAN NOT NULL DEFAULT FALSE,
            color VARCHAR(20) DEFAULT '#8b5cf6',
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)

    # ── Messaging: Wall ──
    op.execute("""
        CREATE TABLE IF NOT EXISTS wall_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            user_id UUID NOT NULL,
            content TEXT NOT NULL,
            is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)

    # ── Messaging: DM conversations ──
    op.execute("""
        CREATE TABLE IF NOT EXISTS dm_conversations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            participant_a UUID NOT NULL,
            participant_b UUID NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_dm_conversation_pair UNIQUE (participant_a, participant_b)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS dm_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
            sender_id UUID NOT NULL,
            content TEXT NOT NULL,
            read_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS dm_messages")
    op.execute("DROP TABLE IF EXISTS dm_conversations")
    op.execute("DROP TABLE IF EXISTS wall_messages")
    op.execute("DROP TABLE IF EXISTS calendar_events")
    op.execute("DROP TABLE IF EXISTS key_results")
    op.execute("DROP TABLE IF EXISTS objectives")
