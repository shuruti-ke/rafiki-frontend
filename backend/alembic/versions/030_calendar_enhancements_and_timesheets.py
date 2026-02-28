"""Calendar enhancements + timesheet_entries table

Revision ID: 016
Revises: 015
Create Date: 2026-02-28

Adds event_type, location, is_virtual, meeting_link, recurrence,
recurrence_end, recurrence_parent, attendees columns to calendar_events.
Creates timesheet_entries table.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


def upgrade():
    # ── Calendar enhancements ──
    op.execute("""
        ALTER TABLE calendar_events
          ADD COLUMN IF NOT EXISTS event_type VARCHAR(30) DEFAULT 'meeting',
          ADD COLUMN IF NOT EXISTS location VARCHAR(500),
          ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS meeting_link VARCHAR(1000),
          ADD COLUMN IF NOT EXISTS recurrence VARCHAR(20),
          ADD COLUMN IF NOT EXISTS recurrence_end DATE,
          ADD COLUMN IF NOT EXISTS recurrence_parent UUID,
          ADD COLUMN IF NOT EXISTS attendees JSONB DEFAULT '[]'::jsonb;
    """)

    # ── Timesheet entries ──
    op.execute("""
        CREATE TABLE IF NOT EXISTS timesheet_entries (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID NOT NULL,
          user_id UUID NOT NULL,
          date DATE NOT NULL,
          project VARCHAR(200) NOT NULL,
          category VARCHAR(100) NOT NULL DEFAULT 'Development',
          hours NUMERIC(4,1) NOT NULL CHECK (hours > 0 AND hours <= 24),
          description TEXT DEFAULT '',
          objective_id UUID,
          status VARCHAR(20) NOT NULL DEFAULT 'draft',
          submitted_at TIMESTAMPTZ,
          approved_by UUID,
          approved_at TIMESTAMPTZ,
          approval_comment TEXT DEFAULT '',
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_ts_user_date ON timesheet_entries(user_id, date);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_ts_org_status ON timesheet_entries(org_id, status);")


def downgrade():
    op.execute("DROP TABLE IF EXISTS timesheet_entries;")
    for col in ["event_type", "location", "is_virtual", "meeting_link",
                "recurrence", "recurrence_end", "recurrence_parent", "attendees"]:
        op.execute(f"ALTER TABLE calendar_events DROP COLUMN IF EXISTS {col};")
