# backend/app/models/employee_profile.py

from sqlalchemy import Column, String, Text, Date, Integer, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database import Base


class EmployeeProfile(Base):
    """
    Existing DB table: employee_profiles

    Keys:
    - id: UUID (PK)
    - user_id: UUID (users_legacy.user_id)
    - org_id: UUID
    """

    __tablename__ = "employee_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True)

    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    org_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    # Existing fields (already in your table)
    employment_number = Column(String, nullable=True)
    national_id = Column(String, nullable=True)

    job_title = Column(String, nullable=True)
    department = Column(String, nullable=True)

    job_description = Column(Text, nullable=True)

    contract_type = Column(String, nullable=True)
    contract_start = Column(String, nullable=True)  # varchar in DB
    contract_end = Column(String, nullable=True)    # varchar in DB

    targets = Column(Text, nullable=True)

    phone = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    emergency_contact = Column(String, nullable=True)

    # NEW HR fields
    status = Column(String(32), nullable=False, default="active")

    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    duration_months = Column(Integer, nullable=True)
    evaluation_period_months = Column(Integer, nullable=True)
    probation_end_date = Column(Date, nullable=True)

    terms_of_service_title = Column(String(250), nullable=True)
    terms_of_service_text = Column(Text, nullable=True)
    terms_of_service_signed_at = Column(DateTime(timezone=True), nullable=True)

    address_line1 = Column(String(255), nullable=True)
    address_line2 = Column(String(255), nullable=True)
    city = Column(String(120), nullable=True)
    state = Column(String(120), nullable=True)
    postal_code = Column(String(40), nullable=True)
    country = Column(String(120), nullable=True)

    emergency_contact_name = Column(String(200), nullable=True)
    emergency_contact_phone = Column(String(50), nullable=True)
    emergency_contact_relationship = Column(String(80), nullable=True)

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())