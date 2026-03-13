"""
Super Admin router — org management, HR admin creation, platform stats.
All endpoints require super_admin role.
"""

import os
import random
import string
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session
import logging

from app.database import get_db
from app.dependencies import require_super_admin, get_current_user_id
from app.models.user import Organization, User
from app.models.document import Document
from app.models.billing import Invoice, InvoiceLineItem, Payment
from app.routers.auth import _hash_password
from app.services.email import send_hr_admin_welcome_email
from app.services.file_storage import save_upload, get_download_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/super-admin", tags=["super-admin"])


# ---------- helpers ----------

def _generate_code(length: int = 5) -> str:
    chars = string.digits
    return "".join(random.choices(chars, k=length))


def _unique_code(db: Session, length: int = 5) -> str:
    for _ in range(50):
        code = _generate_code(length)
        exists = db.query(Organization).filter(Organization.org_code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=500, detail="Could not generate unique org code")


# ---------- schemas ----------

class OrgCreate(BaseModel):
    name: str
    org_code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[int] = None


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    org_code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[int] = None
    is_active: Optional[bool] = None


class OrgStatusUpdate(BaseModel):
    is_active: bool


class UserStatusUpdate(BaseModel):
    is_active: bool


class OrgOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    org_id: UUID
    name: str
    org_code: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[int] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class OrgListItem(OrgOut):
    user_count: int = 0
    documents_count: int = 0
    admin_email: Optional[str] = None


class HRAdminCreate(BaseModel):
    email: str
    password: str
    full_name: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: Optional[str] = None
    name: Optional[str] = None
    role: str
    org_id: Optional[UUID] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PlatformStats(BaseModel):
    total_orgs: int
    total_users: int
    active_orgs: int
    total_documents: int


class OrgBillingLineItemIn(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price_minor: int


class OrgInvoiceCreate(BaseModel):
    purpose: Optional[str] = None
    due_date: Optional[str] = None
    currency: str = "KES"
    line_items: list[OrgBillingLineItemIn]


def _next_invoice_number(org_id: UUID, db: Session) -> str:
    year = datetime.utcnow().year
    prefix = f"ORG-INV-{year}-"
    last = (
        db.query(Invoice.invoice_number)
        .filter(Invoice.org_id == org_id, Invoice.invoice_number.like(f"{prefix}%"))
        .order_by(Invoice.invoice_number.desc())
        .first()
    )
    if last:
        try:
            num = int(last[0].split("-")[-1]) + 1
        except (ValueError, IndexError):
            num = 1
    else:
        num = 1
    return f"{prefix}{num:05d}"


def _receipt_number(payment: Payment) -> str:
    stamp = (payment.received_at or datetime.utcnow()).year
    return f"RCT-{stamp}-{str(payment.id).split('-')[0].upper()}"


def _serialize_payment(payment: Payment) -> dict:
    return {
        "id": str(payment.id),
        "receipt_number": _receipt_number(payment),
        "method": payment.method,
        "amount_minor": payment.amount_minor,
        "amount": payment.amount_minor / 100,
        "currency": payment.currency,
        "reference": payment.reference,
        "has_attachment": bool(payment.attachment_storage_key),
        "received_at": payment.received_at.isoformat() if payment.received_at else None,
    }


def _org_billing_summary(org_id: UUID, db: Session) -> dict:
    invoice_rows = db.query(Invoice).filter(Invoice.org_id == org_id).all()
    invoice_ids = [inv.id for inv in invoice_rows]
    paid_map = {}
    if invoice_ids:
        paid_rows = (
            db.query(Payment.invoice_id, func.coalesce(func.sum(Payment.amount_minor), 0))
            .filter(Payment.invoice_id.in_(invoice_ids))
            .group_by(Payment.invoice_id)
            .all()
        )
        paid_map = {row[0]: int(row[1] or 0) for row in paid_rows}
    total_invoiced = sum(int(inv.amount_minor or 0) for inv in invoice_rows)
    total_received = sum(paid_map.values())
    pending_count = 0
    overdue_count = 0
    now = datetime.utcnow()
    for inv in invoice_rows:
        paid = paid_map.get(inv.id, 0)
        if paid < int(inv.amount_minor or 0):
            pending_count += 1
            if inv.due_date and inv.due_date.replace(tzinfo=None) < now:
                overdue_count += 1
    return {
        "total_invoiced_minor": total_invoiced,
        "total_invoiced": total_invoiced / 100,
        "total_received_minor": total_received,
        "total_received": total_received / 100,
        "outstanding_minor": total_invoiced - total_received,
        "outstanding": (total_invoiced - total_received) / 100,
        "invoice_count": len(invoice_rows),
        "pending_invoice_count": pending_count,
        "overdue_invoice_count": overdue_count,
    }


# ---------- Platform stats ----------

@router.get("/stats", response_model=PlatformStats)
def get_platform_stats(
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    total_orgs = db.query(func.count(Organization.org_id)).scalar() or 0
    total_users = db.query(func.count(User.user_id)).scalar() or 0
    active_orgs = (
        db.query(func.count(Organization.org_id))
        .filter(Organization.is_active == True)
        .scalar()
        or 0
    )
    total_documents = db.query(func.count(Document.id)).scalar() or 0

    return PlatformStats(
        total_orgs=int(total_orgs),
        total_users=int(total_users),
        active_orgs=int(active_orgs),
        total_documents=int(total_documents),
    )


# ---------- Org list ----------

@router.get("/orgs", response_model=list[OrgListItem])
def list_orgs(
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    orgs = db.query(Organization).order_by(Organization.created_at.desc()).all()

    user_counts = dict(
        db.query(User.org_id, func.count(User.user_id))
        .group_by(User.org_id)
        .all()
    )
    doc_counts = dict(
        db.query(Document.org_id, func.count(Document.id))
        .group_by(Document.org_id)
        .all()
    )

    result: list[OrgListItem] = []
    for org in orgs:
        admin = (
            db.query(User)
            .filter(User.org_id == org.org_id, User.role == "hr_admin")
            .first()
        )

        result.append(
            OrgListItem(
                org_id=org.org_id,
                name=org.name,
                org_code=org.org_code,
                industry=org.industry,
                description=org.description,
                employee_count=org.employee_count,
                is_active=bool(org.is_active) if org.is_active is not None else True,
                created_at=org.created_at,
                updated_at=getattr(org, "updated_at", None),
                user_count=int(user_counts.get(org.org_id, 0)),
                documents_count=int(doc_counts.get(org.org_id, 0)),
                admin_email=admin.email if admin else None,
            )
        )

    return result


# ---------- Org details ----------

@router.get("/orgs/{org_id}", response_model=OrgListItem)
def get_org(
    org_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    user_count = (
        db.query(func.count(User.user_id))
        .filter(User.org_id == org_id)
        .scalar()
        or 0
    )
    documents_count = (
        db.query(func.count(Document.id))
        .filter(Document.org_id == org_id)
        .scalar()
        or 0
    )
    admin = (
        db.query(User)
        .filter(User.org_id == org_id, User.role == "hr_admin")
        .first()
    )

    return OrgListItem(
        org_id=org.org_id,
        name=org.name,
        org_code=org.org_code,
        industry=org.industry,
        description=org.description,
        employee_count=org.employee_count,
        is_active=bool(org.is_active) if org.is_active is not None else True,
        created_at=org.created_at,
        updated_at=getattr(org, "updated_at", None),
        user_count=int(user_count),
        documents_count=int(documents_count),
        admin_email=admin.email if admin else None,
    )


@router.get("/orgs/{org_id}/users", response_model=list[UserOut])
def list_org_users(
    org_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    users = (
        db.query(User)
        .filter(User.org_id == org_id)
        .order_by(User.created_at.desc())
        .all()
    )
    return users


# ---------- Org create / update / status ----------

@router.post("/orgs", response_model=OrgOut, status_code=201)
def create_org(
    payload: OrgCreate,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    code = (payload.org_code or _unique_code(db)).strip()

    if db.query(Organization).filter(Organization.org_code == code).first():
        raise HTTPException(status_code=409, detail="Organization code already in use")

    org = Organization(
        name=payload.name,
        org_code=code,
        industry=payload.industry,
        description=payload.description,
        employee_count=payload.employee_count,
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@router.put("/orgs/{org_id}", response_model=OrgOut)
def update_org(
    org_id: UUID,
    payload: OrgUpdate,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    updates = payload.model_dump(exclude_unset=True)

    if "org_code" in updates and updates["org_code"] and updates["org_code"] != org.org_code:
        existing = (
            db.query(Organization)
            .filter(Organization.org_code == updates["org_code"], Organization.org_id != org_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Organization code already in use")

    for key, value in updates.items():
        setattr(org, key, value)

    db.commit()
    db.refresh(org)
    return org


@router.patch("/orgs/{org_id}/status", response_model=OrgOut)
def set_org_status(
    org_id: UUID,
    payload: OrgStatusUpdate,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org.is_active = payload.is_active
    db.commit()
    db.refresh(org)
    return org


@router.post("/orgs/{org_id}/deactivate", response_model=OrgOut)
def deactivate_org(
    org_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Deactivate an organization (soft disable)."""
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.is_active = False
    db.commit()
    db.refresh(org)
    return org


@router.post("/orgs/{org_id}/activate", response_model=OrgOut)
def activate_org(
    org_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Activate an organization."""
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.is_active = True
    db.commit()
    db.refresh(org)
    return org


# ---------- Delete org (optional) ----------
# NOTE: consider "soft delete" via is_active=False instead of hard delete.

@router.delete("/orgs/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_org(
    org_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Guard: do not delete orgs that still have users/documents
    users_exist = db.query(User.user_id).filter(User.org_id == org_id).first() is not None
    docs_exist = db.query(Document.id).filter(Document.org_id == org_id).first() is not None
    if users_exist or docs_exist:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete org with existing users/documents. Deactivate instead.",
        )

    db.delete(org)
    db.commit()
    return None


# ---------- Create HR admin ----------

@router.post("/orgs/{org_id}/admin", response_model=UserOut, status_code=201)
def create_hr_admin(
    org_id: UUID,
    payload: HRAdminCreate,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    email = payload.email.strip().lower()

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=email,
        password_hash=_hash_password(payload.password),
        name=payload.full_name,
        role="hr_admin",
        org_id=org_id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Best-effort: send welcome email to the new HR admin (client)
    try:
        login_url = (os.getenv("HRADMIN_LOGIN_URL", "") or "").strip() or None
        org_name = getattr(org, "name", "") or "your organization"
        send_hr_admin_welcome_email(
            to_email=user.email,
            full_name=payload.full_name,
            org_name=org_name,
            temporary_password=payload.password,
            login_url=login_url,
        )
    except Exception:
        logger.exception(
            "Failed to send HR admin welcome email for org_id=%s email=%s",
            org_id,
            email,
        )

    return user


# ---------- HR admin / user status (deactivate / activate) ----------


@router.patch("/users/{user_id}/status", response_model=UserOut)
def set_user_status(
    user_id: UUID,
    payload: UserStatusUpdate,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Set is_active for a user (e.g. deactivate or reactivate an HR admin)."""
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/deactivate", response_model=UserOut)
def deactivate_user(
    user_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Deactivate a user (e.g. HR admin). They can no longer log in."""
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/activate", response_model=UserOut)
def activate_user(
    user_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Activate a user (e.g. HR admin)."""
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = True
    db.commit()
    db.refresh(user)
    return user


# ---------- Organization billing ----------


@router.get("/billing/overview")
def super_admin_billing_overview(
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    orgs = db.query(Organization).order_by(Organization.name.asc()).all()
    rows = []
    total_invoiced_minor = 0
    total_received_minor = 0
    total_outstanding_minor = 0
    for org in orgs:
        summary = _org_billing_summary(org.org_id, db)
        total_invoiced_minor += summary["total_invoiced_minor"]
        total_received_minor += summary["total_received_minor"]
        total_outstanding_minor += summary["outstanding_minor"]
        rows.append(
            {
                "org_id": str(org.org_id),
                "org_name": org.name,
                "org_code": org.org_code,
                **summary,
            }
        )
    return {
        "summary": {
            "total_invoiced": total_invoiced_minor / 100,
            "total_received": total_received_minor / 100,
            "total_outstanding": total_outstanding_minor / 100,
            "organization_count": len(rows),
        },
        "organizations": rows,
    }


@router.get("/orgs/{org_id}/billing/summary")
def get_org_billing_summary(
    org_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"org_id": str(org_id), "org_name": org.name, **_org_billing_summary(org_id, db)}


@router.get("/orgs/{org_id}/billing/invoices")
def list_org_billing_invoices(
    org_id: UUID,
    status_filter: Optional[str] = Query(None, alias="status"),
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    query = db.query(Invoice).filter(Invoice.org_id == org_id)
    if status_filter:
        query = query.filter(Invoice.status == status_filter.upper())
    invoices = query.order_by(Invoice.created_at.desc()).all()
    paid_rows = (
        db.query(Payment.invoice_id, func.coalesce(func.sum(Payment.amount_minor), 0))
        .filter(Payment.invoice_id.in_([inv.id for inv in invoices]) if invoices else False)
        .group_by(Payment.invoice_id)
        .all()
    ) if invoices else []
    paid_map = {row[0]: int(row[1] or 0) for row in paid_rows}
    return {
        "invoices": [
            {
                "id": str(inv.id),
                "invoice_number": inv.invoice_number,
                "org_id": str(inv.org_id),
                "org_name": org.name,
                "amount_minor": inv.amount_minor,
                "amount": inv.amount_minor / 100,
                "currency": inv.currency,
                "status": inv.status,
                "purpose": inv.purpose,
                "due_date": inv.due_date.isoformat() if inv.due_date else None,
                "created_at": inv.created_at.isoformat() if inv.created_at else None,
                "total_paid_minor": paid_map.get(inv.id, 0),
                "total_paid": paid_map.get(inv.id, 0) / 100,
                "balance_minor": inv.amount_minor - paid_map.get(inv.id, 0),
                "balance": (inv.amount_minor - paid_map.get(inv.id, 0)) / 100,
            }
            for inv in invoices
        ]
    }


@router.post("/orgs/{org_id}/billing/invoices", status_code=201)
def create_org_billing_invoice(
    org_id: UUID,
    payload: OrgInvoiceCreate,
    role: str = Depends(require_super_admin),
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if not payload.line_items:
        raise HTTPException(status_code=400, detail="At least one line item is required")
    amount_minor = 0
    normalized_items = []
    for item in payload.line_items:
        if not item.description.strip():
            raise HTTPException(status_code=400, detail="Line item description is required")
        if item.unit_price_minor < 0 or item.quantity <= 0:
            raise HTTPException(status_code=400, detail="Line item amount must be positive")
        line_amount = int(item.quantity * item.unit_price_minor)
        amount_minor += line_amount
        normalized_items.append(
            {
                "description": item.description.strip(),
                "quantity": item.quantity,
                "unit_price_minor": item.unit_price_minor,
                "amount_minor": line_amount,
            }
        )
    due_dt = None
    if payload.due_date:
        try:
            due_dt = datetime.strptime(payload.due_date, "%Y-%m-%d")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="due_date must be YYYY-MM-DD") from exc
    invoice = Invoice(
        org_id=org_id,
        user_id=None,
        invoice_number=_next_invoice_number(org_id, db),
        amount_minor=amount_minor,
        currency=payload.currency,
        status="PENDING",
        purpose=payload.purpose,
        due_date=due_dt,
        description_json={"line_items": normalized_items, "bill_to_org": org.name},
        created_by_user_id=current_user_id,
    )
    db.add(invoice)
    db.flush()
    for item in normalized_items:
        db.add(
            InvoiceLineItem(
                invoice_id=invoice.id,
                service_id=None,
                description=item["description"],
                quantity=item["quantity"],
                unit_price_minor=item["unit_price_minor"],
                amount_minor=item["amount_minor"],
            )
        )
    db.commit()
    db.refresh(invoice)
    return {
        "id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "org_id": str(org_id),
        "org_name": org.name,
        "amount": invoice.amount_minor / 100,
        "amount_minor": invoice.amount_minor,
        "currency": invoice.currency,
        "status": invoice.status,
        "purpose": invoice.purpose,
    }


@router.get("/billing/invoices/{invoice_id}")
def get_super_admin_invoice_detail(
    invoice_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    org = db.query(Organization).filter(Organization.org_id == invoice.org_id).first()
    line_items = db.query(InvoiceLineItem).filter(InvoiceLineItem.invoice_id == invoice.id).all()
    payments = db.query(Payment).filter(Payment.invoice_id == invoice.id).order_by(Payment.received_at.desc()).all()
    total_paid = sum(int(payment.amount_minor or 0) for payment in payments)
    return {
        "id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "org_id": str(invoice.org_id),
        "org_name": org.name if org else None,
        "amount": invoice.amount_minor / 100,
        "amount_minor": invoice.amount_minor,
        "currency": invoice.currency,
        "status": invoice.status,
        "purpose": invoice.purpose,
        "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
        "created_at": invoice.created_at.isoformat() if invoice.created_at else None,
        "total_paid": total_paid / 100,
        "total_paid_minor": total_paid,
        "balance": (invoice.amount_minor - total_paid) / 100,
        "balance_minor": invoice.amount_minor - total_paid,
        "line_items": [
            {
                "description": item.description,
                "quantity": float(item.quantity),
                "unit_price_minor": item.unit_price_minor,
                "amount_minor": item.amount_minor,
                "unit_price": item.unit_price_minor / 100,
                "amount": item.amount_minor / 100,
            }
            for item in line_items
        ],
        "payments": [_serialize_payment(payment) for payment in payments],
    }


@router.get("/billing/invoices/{invoice_id}/payments")
def list_super_admin_invoice_payments(
    invoice_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    payments = db.query(Payment).filter(Payment.invoice_id == invoice_id).order_by(Payment.received_at.desc()).all()
    return {"payments": [_serialize_payment(payment) for payment in payments]}


@router.post("/billing/invoices/{invoice_id}/payments")
def record_org_invoice_payment(
    invoice_id: UUID,
    method: str = Form(...),
    amount_minor: int = Form(...),
    currency: str = Form("KES"),
    reference: Optional[str] = Form(None),
    attachment: Optional[UploadFile] = File(None),
    role: str = Depends(require_super_admin),
    current_user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Cannot record payment for a cancelled invoice")
    if amount_minor <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")
    method_upper = (method or "").strip().upper()
    if method_upper not in {"MPESA", "CASH", "CHEQUE", "EFT_RTGS"}:
        raise HTTPException(status_code=400, detail="Unsupported payment method")
    attachment_key = None
    attachment_name = None
    if attachment and attachment.filename:
        attachment_key, attachment_name, _ = save_upload(attachment, subfolder="super_admin_billing")
    payment = Payment(
        invoice_id=invoice.id,
        org_id=invoice.org_id,
        method=method_upper,
        amount_minor=amount_minor,
        currency=currency or invoice.currency or "KES",
        reference=(reference or "").strip() or None,
        attachment_storage_key=attachment_key,
        attachment_original_name=attachment_name,
        received_by_user_id=current_user_id,
    )
    db.add(payment)
    db.flush()
    total_paid = (
        db.query(func.coalesce(func.sum(Payment.amount_minor), 0))
        .filter(Payment.invoice_id == invoice.id)
        .scalar()
        or 0
    )
    invoice.status = "PAID" if total_paid >= invoice.amount_minor else "PENDING"
    db.commit()
    db.refresh(payment)
    return {
        **_serialize_payment(payment),
        "invoice_status": invoice.status,
        "invoice_balance": (invoice.amount_minor - total_paid) / 100,
        "invoice_balance_minor": invoice.amount_minor - total_paid,
    }


@router.get("/billing/payments/{payment_id}/attachment")
def get_super_admin_payment_attachment(
    payment_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if not payment.attachment_storage_key:
        raise HTTPException(status_code=404, detail="No attachment for this payment")
    return {
        "url": get_download_url(payment.attachment_storage_key, expires_in=3600),
        "filename": payment.attachment_original_name or "attachment",
    }


@router.get("/billing/payments/{payment_id}/receipt")
def get_payment_receipt(
    payment_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    invoice = db.query(Invoice).filter(Invoice.id == payment.invoice_id).first()
    org = db.query(Organization).filter(Organization.org_id == payment.org_id).first()
    return {
        "receipt_number": _receipt_number(payment),
        "invoice_number": invoice.invoice_number if invoice else None,
        "organization_name": org.name if org else None,
        "method": payment.method,
        "amount": payment.amount_minor / 100,
        "amount_minor": payment.amount_minor,
        "currency": payment.currency,
        "reference": payment.reference,
        "received_at": payment.received_at.isoformat() if payment.received_at else None,
    }


@router.get("/orgs/{org_id}/billing/statement")
def get_org_billing_statement(
    org_id: UUID,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    invoice_query = db.query(Invoice).filter(Invoice.org_id == org_id)
    payment_query = db.query(Payment).filter(Payment.org_id == org_id)
    if start_date:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        invoice_query = invoice_query.filter(Invoice.created_at >= start_dt)
        payment_query = payment_query.filter(Payment.received_at >= start_dt)
    if end_date:
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        invoice_query = invoice_query.filter(Invoice.created_at <= end_dt)
        payment_query = payment_query.filter(Payment.received_at <= end_dt)
    invoices = invoice_query.all()
    payments = payment_query.all()
    entries = []
    for invoice in invoices:
        entries.append(
            {
                "type": "invoice",
                "date": invoice.created_at.isoformat() if invoice.created_at else None,
                "reference": invoice.invoice_number,
                "description": invoice.purpose or "Organization invoice",
                "debit": invoice.amount_minor / 100,
                "credit": 0,
            }
        )
    invoice_map = {inv.id: inv for inv in invoices}
    for payment in payments:
        invoice = invoice_map.get(payment.invoice_id) or db.query(Invoice).filter(Invoice.id == payment.invoice_id).first()
        entries.append(
            {
                "type": "receipt",
                "date": payment.received_at.isoformat() if payment.received_at else None,
                "reference": _receipt_number(payment),
                "description": f"Receipt for {invoice.invoice_number if invoice else 'invoice'}",
                "debit": 0,
                "credit": payment.amount_minor / 100,
            }
        )
    entries.sort(key=lambda entry: entry["date"] or "")
    running_balance = 0.0
    for entry in entries:
        running_balance += float(entry["debit"] or 0) - float(entry["credit"] or 0)
        entry["running_balance"] = round(running_balance, 2)
    return {
        "org_id": str(org_id),
        "org_name": org.name,
        "entries": entries,
        "summary": _org_billing_summary(org_id, db),
    }


@router.get("/orgs/{org_id}/billing/reconciliation")
def get_org_billing_reconciliation(
    org_id: UUID,
    role: str = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    invoices = db.query(Invoice).filter(Invoice.org_id == org_id).order_by(Invoice.created_at.desc()).all()
    rows = []
    total_expected = 0
    total_received = 0
    for invoice in invoices:
        paid_minor = (
            db.query(func.coalesce(func.sum(Payment.amount_minor), 0))
            .filter(Payment.invoice_id == invoice.id)
            .scalar()
            or 0
        )
        balance_minor = invoice.amount_minor - int(paid_minor)
        rows.append(
            {
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "status": invoice.status,
                "expected": invoice.amount_minor / 100,
                "received": int(paid_minor) / 100,
                "outstanding": balance_minor / 100,
                "is_reconciled": balance_minor <= 0,
                "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
            }
        )
        total_expected += invoice.amount_minor
        total_received += int(paid_minor)
    return {
        "org_id": str(org_id),
        "org_name": org.name,
        "summary": {
            "expected": total_expected / 100,
            "received": total_received / 100,
            "outstanding": (total_expected - total_received) / 100,
            "invoice_count": len(rows),
            "reconciled_count": sum(1 for row in rows if row["is_reconciled"]),
        },
        "rows": rows,
    }
