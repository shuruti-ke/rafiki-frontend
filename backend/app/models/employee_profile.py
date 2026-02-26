# backend/app/models/employee_profile.py

import uuid
from sqlalchemy import Column, String, Text, Date, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.database import Base


class EmployeeProfile(Base):
    """
    Table: employee_profiles

    Purpose:
    - HR extension of users_legacy
    - Employees are always users
    - Stores HR-only metadata

    Keys:
    - id: UUID (PK)
    - user_id: UUID -> users_legacy.user_id
    - org_id: UUID -> orgs.org_id
    """

    __tablename__ = "employee_profiles"

    __table_args__ = (
        UniqueConstraint("org_id", "user_id", name="uq_employee_profiles_org_user"),
    )

    # ------------------------------------------------------------------
    # Primary identifiers
    # ------------------------------------------------------------------

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)

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

    # ------------------------------------------------------------------
    # Core employment identity
    # ------------------------------------------------------------------

    employment_number = Column(String, nullable=True)
    national_id = Column(String, nullable=True)

    job_title = Column(String, nullable=True)
    department = Column(String, nullable=True)

    job_description = Column(Text, nullable=True)

    # ------------------------------------------------------------------
    # Contract info
    # ------------------------------------------------------------------

    contract_type = Column(String, nullable=True)

    # Kept as String for backward compatibility with existing DB
    contract_start = Column(String, nullable=True)
    contract_end = Column(String, nullable=True)

    targets = Column(Text, nullable=True)

    # ------------------------------------------------------------------
    # Contact & identity
    # ------------------------------------------------------------------

    phone = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)

    # Legacy single-field emergency contact (backward compatibility)
    emergency_contact = Column(String, nullable=True)

    # ------------------------------------------------------------------
    # HR lifecycle fields
    # ------------------------------------------------------------------

    status = Column(String(32), nullable=False, default="active")

    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    duration_months = Column(Integer, nullable=True)
    evaluation_period_months = Column(Integer, nullable=True)
    probation_end_date = Column(Date, nullable=True)

    # ------------------------------------------------------------------
    # Terms of service
    # ------------------------------------------------------------------

    terms_of_service_title = Column(String(250), nullable=True)
    terms_of_service_text = Column(Text, nullable=True)
    terms_of_service_signed_at = Column(DateTime(timezone=True), nullable=True)

    # ------------------------------------------------------------------
    # Address
    # ------------------------------------------------------------------

    address_line1 = Column(String(255), nullable=True)
    address_line2 = Column(String(255), nullable=True)
    city = Column(String(120), nullable=True)
    state = Column(String(120), nullable=True)
    postal_code = Column(String(40), nullable=True)
    country = Column(String(120), nullable=True)

    # ------------------------------------------------------------------
    # Structured emergency contact
    # ------------------------------------------------------------------

    emergency_contact_name = Column(String(200), nullable=True)
    emergency_contact_phone = Column(String(50), nullable=True)
    emergency_contact_relationship = Column(String(80), nullable=True)

    # ------------------------------------------------------------------
    # Admin notes
    # ------------------------------------------------------------------

    notes = Column(Text, nullable=True)

    # Temporary login credential — set at account creation, cleared after first reset
    initial_password = Column(String(255), nullable=True)

    # ------------------------------------------------------------------
    # Audit fields
    # ------------------------------------------------------------------

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
