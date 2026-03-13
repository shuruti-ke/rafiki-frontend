"""Billing API: Services management, Invoicing, and Payment receipting."""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id, require_admin, get_current_role
from app.models.user import User
from app.models.billing import Service, Invoice, InvoiceLineItem, Payment
from app.services.file_storage import save_upload, get_download_url

router = APIRouter(prefix="/api/v1/billing", tags=["Billing"])


# ─── Schemas ────────────────────────────────────────────────────────────────

class ServiceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price_minor: int
    currency: str = "KES"


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price_minor: Optional[int] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None


class LineItemCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price_minor: int
    service_id: Optional[uuid.UUID] = None


class InvoiceCreate(BaseModel):
    user_id: uuid.UUID
    purpose: Optional[str] = None
    due_date: Optional[str] = None
    currency: str = "KES"
    line_items: list[LineItemCreate]


# ─── Services CRUD (Admin only) ───────────────────────────────────────────────

@router.get("/services")
def list_services(
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
    _role: str = Depends(require_admin),
):
    """List all services for the org."""
    rows = db.query(Service).filter(Service.org_id == org_id).order_by(Service.name).all()
    return [
        {
            "id": str(s.id),
            "name": s.name,
            "description": s.description,
            "price_minor": s.price_minor,
            "price": s.price_minor / 100,
            "currency": s.currency,
            "is_active": s.is_active,
        }
        for s in rows
    ]


@router.post("/services")
def create_service(
    data: ServiceCreate,
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    _role: str = Depends(require_admin),
):
    """Create a new service."""
    svc = Service(
        org_id=org_id,
        name=data.name,
        description=data.description,
        price_minor=data.price_minor,
        currency=data.currency,
    )
    db.add(svc)
    db.commit()
    db.refresh(svc)
    return {
        "id": str(svc.id),
        "name": svc.name,
        "description": svc.description,
        "price_minor": svc.price_minor,
        "price": svc.price_minor / 100,
        "currency": svc.currency,
        "is_active": svc.is_active,
    }


@router.put("/services/{service_id}")
def update_service(
    service_id: uuid.UUID,
    data: ServiceUpdate,
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
    _role: str = Depends(require_admin),
):
    """Update a service."""
    svc = db.query(Service).filter(Service.id == service_id, Service.org_id == org_id).first()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    if data.name is not None:
        svc.name = data.name
    if data.description is not None:
        svc.description = data.description
    if data.price_minor is not None:
        svc.price_minor = data.price_minor
    if data.currency is not None:
        svc.currency = data.currency
    if data.is_active is not None:
        svc.is_active = data.is_active
    db.commit()
    db.refresh(svc)
    return {
        "id": str(svc.id),
        "name": svc.name,
        "description": svc.description,
        "price_minor": svc.price_minor,
        "price": svc.price_minor / 100,
        "currency": svc.currency,
        "is_active": svc.is_active,
    }


@router.delete("/services/{service_id}")
def delete_service(
    service_id: uuid.UUID,
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
    _role: str = Depends(require_admin),
):
    """Delete (or deactivate) a service."""
    svc = db.query(Service).filter(Service.id == service_id, Service.org_id == org_id).first()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    svc.is_active = False
    db.commit()
    return {"ok": True}


# ─── User search for invoicing (Admin) ───────────────────────────────────────

@router.get("/users")
def search_billable_users(
    q: Optional[str] = Query(None, description="Search by name, email, role"),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
    _role: str = Depends(require_admin),
):
    """Search users in org for billing (employees, managers)."""
    query = db.query(User).filter(User.org_id == org_id, User.is_active == True)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                User.name.ilike(term),
                User.email.ilike(term),
                User.role.ilike(term),
                User.department.ilike(term),
                User.job_title.ilike(term),
            )
        )
    users = query.order_by(User.name).limit(50).all()
    return [
        {
            "user_id": str(u.user_id),
            "name": u.name or u.email or "—",
            "email": u.email,
            "role": str(u.role) if u.role else "user",
            "department": u.department,
            "job_title": u.job_title,
        }
        for u in users
    ]


# ─── Invoice number generator ────────────────────────────────────────────────

def _next_invoice_number(org_id: uuid.UUID, db: Session) -> str:
    year = datetime.utcnow().year
    prefix = f"INV-{year}-"
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


# ─── Invoices ────────────────────────────────────────────────────────────────

@router.get("/invoices")
def list_invoices(
    user_id_filter: Optional[uuid.UUID] = Query(None, alias="user_id"),
    status: Optional[str] = Query(None),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    """List invoices. Admin sees all; pass user_id to filter. For managers/employees, returns own only."""
    # For non-admin, only own invoices
    if role not in ("hr_admin", "super_admin"):
        query = db.query(Invoice).filter(
            Invoice.org_id == org_id,
            Invoice.user_id == current_user_id,
        )
    else:
        query = db.query(Invoice).filter(Invoice.org_id == org_id)
        if user_id_filter:
            query = query.filter(Invoice.user_id == user_id_filter)
    if status:
        query = query.filter(Invoice.status == status.upper())

    invoices = query.order_by(Invoice.created_at.desc()).limit(200).all()
    # Load user names
    user_ids = {inv.user_id for inv in invoices if inv.user_id}
    users = {u.user_id: u for u in db.query(User).filter(User.user_id.in_(user_ids)).all()} if user_ids else {}

    return [
        {
            "id": str(inv.id),
            "invoice_number": inv.invoice_number,
            "user_id": str(inv.user_id) if inv.user_id else None,
            "user_name": users.get(inv.user_id).name if inv.user_id and inv.user_id in users else None,
            "user_email": users.get(inv.user_id).email if inv.user_id and inv.user_id in users else None,
            "amount_minor": inv.amount_minor,
            "amount": inv.amount_minor / 100,
            "currency": inv.currency,
            "status": inv.status,
            "purpose": inv.purpose,
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
        }
        for inv in invoices
    ]


@router.post("/invoices")
def create_invoice(
    data: InvoiceCreate,
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    _role: str = Depends(require_admin),
):
    """Create an invoice for a user."""
    if not data.line_items:
        raise HTTPException(status_code=400, detail="At least one line item required")

    # Verify user exists in org
    user = db.query(User).filter(User.user_id == data.user_id, User.org_id == org_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found in organization")

    amount_minor = 0
    line_items_data = []
    for li in data.line_items:
        amt = int(li.quantity * li.unit_price_minor)
        amount_minor += amt
        line_items_data.append({
            "description": li.description,
            "quantity": li.quantity,
            "unit_price_minor": li.unit_price_minor,
            "amount_minor": amt,
        })

    inv_num = _next_invoice_number(org_id, db)
    due_dt = None
    if data.due_date:
        try:
            due_dt = datetime.strptime(data.due_date, "%Y-%m-%d")
        except ValueError:
            pass

    inv = Invoice(
        org_id=org_id,
        user_id=data.user_id,
        invoice_number=inv_num,
        amount_minor=amount_minor,
        currency=data.currency,
        status="PENDING",
        purpose=data.purpose,
        due_date=due_dt,
        description_json={
            "purpose": data.purpose,
            "line_items": line_items_data,
        },
        created_by_user_id=current_user_id,
    )
    db.add(inv)
    db.flush()

    for li in data.line_items:
        amt = int(li.quantity * li.unit_price_minor)
        db.add(InvoiceLineItem(
            invoice_id=inv.id,
            service_id=li.service_id,
            description=li.description,
            quantity=li.quantity,
            unit_price_minor=li.unit_price_minor,
            amount_minor=amt,
        ))
    db.commit()
    db.refresh(inv)

    return {
        "id": str(inv.id),
        "invoice_number": inv.invoice_number,
        "user_id": str(inv.user_id),
        "amount_minor": inv.amount_minor,
        "amount": inv.amount_minor / 100,
        "currency": inv.currency,
        "status": inv.status,
    }


@router.get("/invoices/{invoice_id}")
def get_invoice(
    invoice_id: uuid.UUID,
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get invoice details. User can only access own invoices unless admin."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.org_id == org_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Non-admin: only own
    user = db.query(User).filter(User.user_id == current_user_id).first()
    if user and user.role not in ("hr_admin", "super_admin") and inv.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    items = db.query(InvoiceLineItem).filter(InvoiceLineItem.invoice_id == inv.id).all()
    total_paid = (
        db.query(func.coalesce(func.sum(Payment.amount_minor), 0))
        .filter(Payment.invoice_id == inv.id)
        .scalar()
    ) or 0

    bill_to = None
    if inv.user_id:
        u = db.query(User).filter(User.user_id == inv.user_id).first()
        if u:
            bill_to = {"user_id": str(u.user_id), "name": u.name, "email": u.email, "role": str(u.role)}

    return {
        "id": str(inv.id),
        "invoice_number": inv.invoice_number,
        "user_id": str(inv.user_id) if inv.user_id else None,
        "bill_to": bill_to,
        "amount_minor": inv.amount_minor,
        "amount": inv.amount_minor / 100,
        "currency": inv.currency,
        "status": inv.status,
        "total_paid_minor": total_paid,
        "total_paid": total_paid / 100,
        "purpose": inv.purpose,
        "due_date": inv.due_date.isoformat() if inv.due_date else None,
        "description_json": inv.description_json,
        "line_items": [
            {
                "description": i.description,
                "quantity": float(i.quantity),
                "unit_price_minor": i.unit_price_minor,
                "amount_minor": i.amount_minor,
            }
            for i in items
        ],
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
    }


# ─── Payments (receiving and receipting) ───────────────────────────────────────

PAYMENT_METHODS = ("MPESA", "CASH", "CHEQUE", "EFT_RTGS")


@router.get("/invoices/{invoice_id}/payments")
def list_invoice_payments(
    invoice_id: uuid.UUID,
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
    _role: str = Depends(require_admin),
):
    """List all payments received against an invoice."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.org_id == org_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    payments = db.query(Payment).filter(Payment.invoice_id == invoice_id).order_by(Payment.received_at.desc()).all()
    return [
        {
            "id": str(p.id),
            "method": p.method,
            "amount_minor": p.amount_minor,
            "amount": p.amount_minor / 100,
            "currency": p.currency,
            "reference": p.reference,
            "has_attachment": bool(p.attachment_storage_key),
            "received_at": p.received_at.isoformat() if p.received_at else None,
        }
        for p in payments
    ]


@router.post("/invoices/{invoice_id}/payments")
def record_payment(
    invoice_id: uuid.UUID,
    method: str = Form(..., description="MPESA, CASH, CHEQUE, or EFT_RTGS"),
    amount_minor: int = Form(..., description="Amount in minor units (cents)"),
    currency: str = Form("KES"),
    reference: Optional[str] = Form(None, description="M-Pesa transaction code, cheque number, or bank reference"),
    attachment: Optional[UploadFile] = File(None, description="Cheque image or transaction proof"),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    _role: str = Depends(require_admin),
):
    """Record a payment received against an invoice. Updates invoice status to PAID when fully paid."""
    method_upper = (method or "").strip().upper()
    if method_upper not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail=f"method must be one of: {', '.join(PAYMENT_METHODS)}")

    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.org_id == org_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Cannot record payment for cancelled invoice")

    if amount_minor <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    attachment_key = None
    attachment_name = None
    if attachment and attachment.filename:
        file_path, original_name, _ = save_upload(attachment, subfolder="billing_payments")
        attachment_key = file_path
        attachment_name = original_name

    payment = Payment(
        invoice_id=invoice_id,
        org_id=org_id,
        method=method_upper,
        amount_minor=amount_minor,
        currency=currency or "KES",
        reference=(reference or "").strip() or None,
        attachment_storage_key=attachment_key,
        attachment_original_name=attachment_name,
        received_by_user_id=current_user_id,
    )
    db.add(payment)
    db.flush()

    # Sum payments and update invoice status
    total_paid = (
        db.query(func.coalesce(func.sum(Payment.amount_minor), 0))
        .filter(Payment.invoice_id == invoice_id)
        .scalar()
    )
    if total_paid >= inv.amount_minor:
        inv.status = "PAID"
    db.commit()
    db.refresh(payment)
    db.refresh(inv)

    return {
        "id": str(payment.id),
        "method": payment.method,
        "amount_minor": payment.amount_minor,
        "amount": payment.amount_minor / 100,
        "currency": payment.currency,
        "reference": payment.reference,
        "has_attachment": bool(payment.attachment_storage_key),
        "received_at": payment.received_at.isoformat() if payment.received_at else None,
        "invoice_status": inv.status,
    }


@router.get("/payments/{payment_id}/attachment")
def get_payment_attachment_url(
    payment_id: uuid.UUID,
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
    _role: str = Depends(require_admin),
):
    """Get a presigned download URL for the payment attachment (cheque image or transaction proof)."""
    payment = db.query(Payment).filter(Payment.id == payment_id, Payment.org_id == org_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if not payment.attachment_storage_key:
        raise HTTPException(status_code=404, detail="No attachment for this payment")

    url = get_download_url(payment.attachment_storage_key, expires_in=3600)
    return {"url": url, "filename": payment.attachment_original_name or "attachment"}


@router.get("/account-summary")
def get_account_summary(
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get current user's billing summary (for employee/manager dashboards)."""
    pending = (
        db.query(func.count(Invoice.id), func.coalesce(func.sum(Invoice.amount_minor), 0))
        .filter(
            Invoice.org_id == org_id,
            Invoice.user_id == current_user_id,
            Invoice.status == "PENDING",
        )
        .first()
    )
    count = pending[0] or 0
    total = pending[1] or 0
    return {
        "invoices_pending": count,
        "balance_due": total / 100,
        "balance_due_minor": total,
    }
