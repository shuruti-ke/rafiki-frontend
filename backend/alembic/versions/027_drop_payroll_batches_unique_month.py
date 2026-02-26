"""Drop unique constraint on payroll_batches (org_id, period_year, period_month)
to allow multiple batches per month (re-uploads of distributed payroll).

Revision ID: 027
Revises: 026
Create Date: 2026-02-26
"""
from alembic import op

revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        DO $$
        DECLARE
            cname text;
        BEGIN
            SELECT conname INTO cname
            FROM pg_constraint
            WHERE conrelid = 'payroll_batches'::regclass
              AND contype = 'u'
              AND conkey = ARRAY(
                  SELECT attnum FROM pg_attribute
                  WHERE attrelid = 'payroll_batches'::regclass
                    AND attname IN ('org_id','period_year','period_month')
                  ORDER BY attnum
              );
            IF cname IS NOT NULL THEN
                EXECUTE 'ALTER TABLE payroll_batches DROP CONSTRAINT ' || quote_ident(cname);
            END IF;
        END$$
    """)
    # Also drop by known name in case the array check doesn't match ordering
    op.execute("""
        ALTER TABLE payroll_batches
            DROP CONSTRAINT IF EXISTS payroll_batches_org_id_period_year_period_month_key
    """)


def downgrade():
    pass
