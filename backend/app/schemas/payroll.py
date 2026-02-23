import uuid
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class PayrollTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    template_id: uuid.UUID
    org_id: uuid.UUID
    title: str
    storage_key: str
    mime_type: str
    created_by_user_id: uuid.UUID
    is_active: bool
    created_at: datetime


class PayrollBatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    batch_id: uuid.UUID
    org_id: uuid.UUID
    period_year: int
    period_month: int
    template_id: uuid.UUID
    upload_storage_key: str
    upload_mime_type: str
    status: str
    payroll_total: Optional[float] = None
    computed_total: Optional[float] = None
    discrepancy: Optional[float] = None
    created_by_user_id: uuid.UUID
    created_at: datetime
    approved_by_user_id: Optional[uuid.UUID] = None
    approved_at: Optional[datetime] = None
    distributed_at: Optional[datetime] = None


class PayslipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    payslip_id: uuid.UUID
    org_id: uuid.UUID
    batch_id: uuid.UUID
    employee_user_id: uuid.UUID
    gross_pay: Optional[float] = None
    total_deductions: Optional[float] = None
    net_pay: Optional[float] = None
    document_id: uuid.UUID
    created_at: datetime


class PayrollSummary(BaseModel):
    batch_id: str
    period_year: int
    period_month: int
    total_gross: float
    total_deductions: float
    total_net: float
    employee_count: int
    matched_count: int
    unmatched_names: list[str] = []
    reconciled: bool
    entries: list[dict] = []


class PayslipEntry(BaseModel):
    employee_name: str
    gross_salary: float
    deductions: float
    net_salary: float
    matched_user_id: Optional[str] = None
