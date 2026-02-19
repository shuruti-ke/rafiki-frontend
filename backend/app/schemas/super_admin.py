from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# --- Request schemas ---

class OrgCreate(BaseModel):
    name: str
    code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[int] = None


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[int] = None
    is_active: Optional[bool] = None


class HRAdminCreate(BaseModel):
    email: str
    password: str
    full_name: str


# --- Response schemas ---

class OrgOut(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[int] = None
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OrgListItem(OrgOut):
    user_count: int = 0
    admin_email: Optional[str] = None


class UserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PlatformStats(BaseModel):
    total_orgs: int
    total_users: int
    active_orgs: int
