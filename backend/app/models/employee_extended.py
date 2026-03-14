# backend/app/models/employee_extended.py
# Additional employee profile sections: dependents, work experience, education, company assets

import uuid
from sqlalchemy import Column, String, Text, Date, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.database import Base


class EmployeeDependent(Base):
    """Next of kin, emergency contacts, and dependents (per employee)."""
    __tablename__ = "employee_dependents"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False, index=True)
    org_id = Column(PGUUID(as_uuid=True), ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False, index=True)

    contact_type = Column(String(50), nullable=False)  # next_of_kin, emergency_contact, dependent
    full_name = Column(String(200), nullable=False)
    relationship = Column(String(100), nullable=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class EmployeeWorkExperience(Base):
    """Previous employers, roles, duration, responsibilities."""
    __tablename__ = "employee_work_experience"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False, index=True)
    org_id = Column(PGUUID(as_uuid=True), ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False, index=True)

    employer_name = Column(String(255), nullable=False)
    job_title = Column(String(200), nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    is_current = Column(String(10), nullable=True)  # true/false as string for flexibility
    responsibilities = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class EmployeeEducation(Base):
    """Qualifications, institutions, certifications, year of completion."""
    __tablename__ = "employee_education"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False, index=True)
    org_id = Column(PGUUID(as_uuid=True), ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False, index=True)

    institution = Column(String(255), nullable=False)
    qualification = Column(String(200), nullable=True)
    field_of_study = Column(String(200), nullable=True)
    year_completed = Column(Integer, nullable=True)
    is_certification = Column(String(10), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class EmployeeAsset(Base):
    """Devices, equipment, and other assets assigned to the employee."""
    __tablename__ = "employee_assets"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users_legacy.user_id", ondelete="CASCADE"), nullable=False, index=True)
    org_id = Column(PGUUID(as_uuid=True), ForeignKey("orgs.org_id", ondelete="CASCADE"), nullable=False, index=True)

    asset_type = Column(String(100), nullable=False)  # laptop, phone, badge, etc.
    description = Column(String(500), nullable=True)
    serial_number = Column(String(120), nullable=True)
    assigned_date = Column(Date, nullable=True)
    returned_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
