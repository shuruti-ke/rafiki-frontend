"""Add group conversations with join table

Revision ID: 015
Revises: 014
Create Date: 2026-02-21

Migrates from participant_a/participant_b columns to a
conversation_participants join table. Adds title and is_group fields.
Idempotent -- uses IF NOT EXISTS / IF EXISTS.
"""
from typing import Sequence, Union
from alembic import op

revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns to dm_conversations
    op.execute("""
        ALTER TABLE dm_conversations ADD COLUMN IF NOT EXISTS title VARCHAR(200)
    """)
    op.execute("""
        ALTER TABLE dm_conversations ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT FALSE
    """)

    # Create join table
    op.execute("""
        CREATE TABLE IF NOT EXISTS conversation_participants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
            user_id UUID NOT NULL,
            joined_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_convo_participant UNIQUE (conversation_id, user_id)
        )
    """)

    # Migrate existing data: insert 2 rows per existing conversation
    op.execute("""
        INSERT INTO conversation_participants (conversation_id, user_id)
        SELECT id, participant_a FROM dm_conversations
        WHERE participant_a IS NOT NULL
        ON CONFLICT DO NOTHING
    """)
    op.execute("""
        INSERT INTO conversation_participants (conversation_id, user_id)
        SELECT id, participant_b FROM dm_conversations
        WHERE participant_b IS NOT NULL
        ON CONFLICT DO NOTHING
    """)

    # Drop old constraint and columns
    op.execute("""
        ALTER TABLE dm_conversations DROP CONSTRAINT IF EXISTS uq_dm_conversation_pair
    """)
    op.execute("""
        ALTER TABLE dm_conversations DROP COLUMN IF EXISTS participant_a
    """)
    op.execute("""
        ALTER TABLE dm_conversations DROP COLUMN IF EXISTS participant_b
    """)


def downgrade() -> None:
    # Re-add old columns
    op.execute("""
        ALTER TABLE dm_conversations ADD COLUMN IF NOT EXISTS participant_a UUID
    """)
    op.execute("""
        ALTER TABLE dm_conversations ADD COLUMN IF NOT EXISTS participant_b UUID
    """)

    # Restore data from join table (only for 1-on-1 conversations)
    op.execute("""
        UPDATE dm_conversations SET participant_a = cp.user_id
        FROM (
            SELECT conversation_id, user_id,
                   ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY user_id) AS rn
            FROM conversation_participants
        ) cp
        WHERE dm_conversations.id = cp.conversation_id AND cp.rn = 1
    """)
    op.execute("""
        UPDATE dm_conversations SET participant_b = cp.user_id
        FROM (
            SELECT conversation_id, user_id,
                   ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY user_id) AS rn
            FROM conversation_participants
        ) cp
        WHERE dm_conversations.id = cp.conversation_id AND cp.rn = 2
    """)

    # Re-add unique constraint
    op.execute("""
        ALTER TABLE dm_conversations
        ADD CONSTRAINT uq_dm_conversation_pair UNIQUE (participant_a, participant_b)
    """)

    # Drop join table and new columns
    op.execute("DROP TABLE IF EXISTS conversation_participants")
    op.execute("ALTER TABLE dm_conversations DROP COLUMN IF EXISTS title")
    op.execute("ALTER TABLE dm_conversations DROP COLUMN IF EXISTS is_group")
