"""
Employee Attendance Tracking — attendance_logs table.

Uses UUIDs for id and user_id (FK to users_legacy.user_id).
Server-side timestamps for check_in and check_out.
"""

from sqlalchemy import Column, String, Integer, DateTime, Date, Numeric, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from app.database import Base


class AttendanceLog(Base):
    """
    Table: attendance_logs

    Records check-in and check-out times for employees.
    - id: UUID (PK)
    - user_id: UUID -> users_legacy.user_id
    - org_id: UUID -> orgs.org_id
    """

    __tablename__ = "attendance_logs"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users_legacy.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    org_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("orgs.org_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    work_date = Column(Date, nullable=False)
    check_in = Column(DateTime(timezone=True), nullable=False)
    check_out = Column(DateTime(timezone=True), nullable=True)

    # Optional geolocation for check-in
    check_in_lat = Column(Numeric(9, 6), nullable=True)
    check_in_long = Column(Numeric(9, 6), nullable=True)
    check_in_accuracy = Column(Integer, nullable=True)
    check_in_ip_address = Column(String(45), nullable=True)

    # Optional geolocation for check-out
    check_out_lat = Column(Numeric(9, 6), nullable=True)
    check_out_long = Column(Numeric(9, 6), nullable=True)
    check_out_accuracy = Column(Integer, nullable=True)
    check_out_ip_address = Column(String(45), nullable=True)

    total_seconds = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
