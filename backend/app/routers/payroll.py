# backend/app/routers/payroll.py

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_org_id, get_current_user_id, require_admin, get_current_role
from app.models.payroll import PayrollTemplate, PayrollBatch, Payslip
from app.models.employee_document import EmployeeDocument
from app.models.user import User  # users_legacy
from app.schemas.payroll import (
    PayrollTemplateResponse,
    PayrollBatchResponse,
    PayslipResponse,
)
from app.services.file_storage import save_upload, get_download_url, delete_file
from app.services.audit import log_action
from app.services.payroll_parser import parse_payroll_file

router = APIRouter(prefix="/api/v1/payroll", tags=["Payroll"])

# ------------------------------------------------------------
# OPTIONAL Message model support (depends on your repo schema)
# If you have a Message model/table, wire it here.
# This keeps this router from crashing if Message isn't present.
# ------------------------------------------------------------
try:
    # Common possibilities in repos:
    # - app.models.message import Message
    # - app.models.messages import Message
    from app.models.message import Message  # type: ignore
except Exception:
    try:
        from app.models.messages import Message  # type: ignore
    except Exception:
        Message = None  # noqa: N816


# -------------------------
# Response extensions
# -------------------------
class PayrollBatchUploadResponse(PayrollBatchResponse):
    replaced: bool = False
    requires_approval: bool = False
    warning: Optional[str] = None


PAYROLL_MIME_TYPES = {
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

_PRIVILEGED_ROLES = {"hr_admin", "super_admin"}


# -------------------------
# Helpers
# -------------------------
def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _set_if_attr(obj, attr: str, value):
    """Safely set attribute if the column exists on the SQLAlchemy model."""
    if hasattr(obj, attr):
        setattr(obj, attr, value)


def _get_if_attr(obj, attr: str, default=None):
    return getattr(obj, attr, default)


def _send_message(
    db: Session,
    *,
    org_id: uuid.UUID,
    sender_id: uuid.UUID,
    recipient_id: uuid.UUID,
    subject: str,
    body: str,
    message_type: str,
    payload: dict,
):
    """
    Sends an in-app message if your repo has a Message model.
    If Message model doesn't exist, it becomes a no-op (but workflow still functions via API status).
    """
    if Message is None:
        return

    # Try a few common field names without crashing if your Message schema differs slightly.
    msg = Message()
    _set_if_attr(msg, "org_id", org_id)
    _set_if_attr(msg, "sender_id", sender_id)
    _set_if_attr(msg, "from_user_id", sender_id)
    _set_if_attr(msg, "recipient_id", recipient_id)
    _set_if_attr(msg, "to_user_id", recipient_id)
    _set_if_attr(msg, "subject", subject)
    _set_if_attr(msg, "title", subject)
    _set_if_attr(msg, "body", body)
    _set_if_attr(msg, "content", body)
    _set_if_attr(msg, "message_type", message_type)
    _set_if_attr(msg, "type", message_type)
    _set_if_attr(msg, "payload", payload)
    _set_if_attr(msg, "meta", payload)
    _set_if_attr(msg, "created_at", _now_utc())

    db.add(msg)


def _require_pending_approval(batch: PayrollBatch):
    if getattr(batch, "status", None) != "uploaded_needs_approval":
        raise HTTPException(status_code=400, detail=f"Batch is not pending approval (status={batch.status})")


def _ensure_approved_for_parse_or_distribute(batch: PayrollBatch):
    # Your current flow uses "uploaded_needs_approval" to block parse/distribute.
    if batch.status == "uploaded_needs_approval":
        raise HTTPException(status_code=409, detail="Payroll batch requires approval before proceeding.")


# ─────────────────────────────────────────────────────────────
# Payroll Templates
# ─────────────────────────────────────────────────────────────
@router.post("/templates/upload", response_model=PayrollTemplateResponse)
def upload_template(
    file: UploadFile = File(...),
    title: str = Query(...),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_admin),
):
    file_path, original_name, size = save_upload(file, subfolder="payroll_templates")
    template = PayrollTemplate(
        org_id=org_id,
        title=title,
        storage_key=file_path,
        mime_type=file.content_type or "application/octet-stream",
        created_by_user_id=current_user_id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    log_action(db, org_id, current_user_id, "upload", "payroll_template", template.template_id, {"title": title})
    return template


@router.get("/templates", response_model=list[PayrollTemplateResponse])
def list_templates(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    return (
        db.query(PayrollTemplate)
        .filter(PayrollTemplate.org_id == org_id)
        .order_by(PayrollTemplate.created_at.desc())
        .all()
    )


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_admin),
):
    tmpl = (
        db.query(PayrollTemplate)
        .filter(PayrollTemplate.template_id == template_id, PayrollTemplate.org_id == org_id)
        .first()
    )
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    delete_file(tmpl.storage_key)
    db.delete(tmpl)
    db.commit()

    log_action(db, org_id, current_user_id, "delete", "payroll_template", template_id, {})
    return {"ok": True, "message": "Template deleted"}


# ─────────────────────────────────────────────────────────────
# Payroll Approval: Approver list + request + approve/reject
# ─────────────────────────────────────────────────────────────
@router.get("/approvers")
def list_payroll_approvers(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """
    For the HR Admin dropdown.
    MVP: anyone in org with role hr_admin or super_admin.
    """
    users = (
        db.query(User)
        .filter(User.org_id == org_id, User.is_active == True)  # noqa: E712
        .all()
    )

    approvers = []
    for u in users:
        role_val = str(getattr(u, "role", "") or "")
        if role_val in _PRIVILEGED_ROLES:
            approvers.append(
                {
                    "user_id": str(u.user_id),
                    "name": getattr(u, "name", None),
                    "email": getattr(u, "email", None),
                    "role": role_val,
                }
            )

    # sort friendly
    approvers.sort(key=lambda x: (x.get("name") or "", x.get("email") or ""))
    return {"approvers": approvers}


@router.post("/batches/{batch_id}/request-approval")
def request_payroll_approval(
    batch_id: uuid.UUID,
    approver_user_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_admin),
):
    """
    HR Admin selects an approver (dropdown), we:
    - set batch status = uploaded_needs_approval (pending)
    - record approval routing (if columns exist)
    - send message to approver with action payload
    """
    batch = (
        db.query(PayrollBatch)
        .filter(PayrollBatch.batch_id == batch_id, PayrollBatch.org_id == org_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Payroll batch not found")

    # Ensure it's in a requestable state
    if batch.status in ("distributed",):
        raise HTTPException(status_code=409, detail="Cannot request approval for a distributed payroll batch")

    # Mark pending approval (your system already uses this state)
    batch.status = "uploaded_needs_approval"

    # Store routing fields if your DB has them
    _set_if_attr(batch, "approval_requested_to", approver_user_id)
    _set_if_attr(batch, "approval_requested_by", current_user_id)
    _set_if_attr(batch, "approval_requested_at", _now_utc())

    # Message to approver (includes file info + action types)
    payload = {
        "batch_id": str(batch.batch_id),
        "period_year": getattr(batch, "period_year", None),
        "period_month": getattr(batch, "period_month", None),
        "filename": getattr(batch, "upload_original_filename", None),
        "mime_type": getattr(batch, "upload_mime_type", None),
        "actions": [
            {"type": "approve_payroll", "label": "Approve"},
            {"type": "reject_payroll", "label": "Reject"},
        ],
    }
    _send_message(
        db,
        org_id=org_id,
        sender_id=current_user_id,
        recipient_id=approver_user_id,
        subject="Payroll approval requested",
        body="A payroll batch is ready for your review. Approve or reject to continue processing.",
        message_type="payroll_approval_request",
        payload=payload,
    )

    db.commit()
    log_action(
        db,
        org_id,
        current_user_id,
        "request_approval",
        "payroll_batch",
        batch.batch_id,
        {"approver_user_id": str(approver_user_id)},
    )
    return {"ok": True, "batch_id": str(batch.batch_id), "status": batch.status, "sent_to": str(approver_user_id)}


@router.post("/batches/{batch_id}/approve", response_model=PayrollBatchResponse)
def approve_batch(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    """
    Approver clicks Approve from message UI.
    Rules:
    - If approval_requested_to exists, only that user (or privileged HR/Super) can approve.
    - Move status to 'uploaded' (ready for parse).
    """
    batch = (
        db.query(PayrollBatch)
        .filter(PayrollBatch.batch_id == batch_id, PayrollBatch.org_id == org_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Payroll batch not found")

    _require_pending_approval(batch)

    requested_to = _get_if_attr(batch, "approval_requested_to", None)
    if requested_to and requested_to != current_user_id and str(role) not in _PRIVILEGED_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized to approve this payroll batch")

    batch.approved_by_user_id = current_user_id
    batch.approved_at = _now_utc()

    # Store richer fields if present
    _set_if_attr(batch, "approved_by", current_user_id)
    _set_if_attr(batch, "approved_at", _now_utc())

    batch.status = "uploaded"  # approved and ready for parse

    # Notify requester (HR Admin) if tracked
    requested_by = _get_if_attr(batch, "approval_requested_by", None)
    if requested_by:
        _send_message(
            db,
            org_id=org_id,
            sender_id=current_user_id,
            recipient_id=requested_by,
            subject="Payroll approved",
            body="Payroll has been approved. You can now parse the payroll.",
            message_type="payroll_approved",
            payload={"batch_id": str(batch.batch_id), "status": "uploaded"},
        )

    db.commit()
    db.refresh(batch)

    log_action(db, org_id, current_user_id, "approve", "payroll_batch", batch.batch_id, {})
    return batch


@router.post("/batches/{batch_id}/reject")
def reject_batch(
    batch_id: uuid.UUID,
    reason: str = Query(default=""),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    """
    Approver clicks Reject from message UI.
    We keep status as uploaded_needs_approval (still blocked), but record rejection metadata if columns exist.
    """
    batch = (
        db.query(PayrollBatch)
        .filter(PayrollBatch.batch_id == batch_id, PayrollBatch.org_id == org_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Payroll batch not found")

    _require_pending_approval(batch)

    requested_to = _get_if_attr(batch, "approval_requested_to", None)
    if requested_to and requested_to != current_user_id and str(role) not in _PRIVILEGED_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized to reject this payroll batch")

    # Record rejection metadata if your DB has the fields
    _set_if_attr(batch, "rejected_by", current_user_id)
    _set_if_attr(batch, "rejected_at", _now_utc())
    _set_if_attr(batch, "rejection_reason", reason or None)

    # Keep it blocked. You can optionally add a dedicated "rejected" status if you prefer.
    batch.status = "uploaded_needs_approval"

    requested_by = _get_if_attr(batch, "approval_requested_by", None)
    if requested_by:
        _send_message(
            db,
            org_id=org_id,
            sender_id=current_user_id,
            recipient_id=requested_by,
            subject="Payroll rejected",
            body=f"Payroll was rejected. Reason: {reason or 'Not provided'}",
            message_type="payroll_rejected",
            payload={"batch_id": str(batch.batch_id), "status": "rejected", "reason": reason},
        )

    db.commit()
    log_action(
        db,
        org_id,
        current_user_id,
        "reject",
        "payroll_batch",
        batch.batch_id,
        {"reason": reason},
    )
    return {"ok": True, "batch_id": str(batch.batch_id), "status": batch.status, "reason": reason}


# ─────────────────────────────────────────────────────────────
# Payroll Batches (uploads)
# ─────────────────────────────────────────────────────────────
@router.post("/upload", response_model=PayrollBatchUploadResponse)
def upload_payroll(
    file: UploadFile = File(...),
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    template_id: uuid.UUID = Query(...),
    force: bool = Query(default=False),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_admin),
):
    content_type = file.content_type or ""
    if content_type not in PAYROLL_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed: {content_type}. Use CSV, Excel, PDF, or DOCX.",
        )

    tmpl = (
        db.query(PayrollTemplate)
        .filter(PayrollTemplate.template_id == template_id, PayrollTemplate.org_id == org_id)
        .first()
    )
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")

    year, mo = int(month[:4]), int(month[5:])

    file_path, original_name, size = save_upload(file, subfolder="payroll_uploads")

    existing = (
        db.query(PayrollBatch)
        .filter(
            PayrollBatch.org_id == org_id,
            PayrollBatch.period_year == year,
            PayrollBatch.period_month == mo,
        )
        .first()
    )

    if existing:
        was_distributed = existing.status == "distributed"
        warning = None

        if was_distributed and not force:
            raise HTTPException(
                status_code=409,
                detail=f"Payroll for {month} has already been distributed. Re-upload with force=true to override.",
            )

        if was_distributed and force:
            warning = (
                f"⚠️ You replaced a distributed payroll for {month}. "
                "Old payslips may still reference the previous file. "
                "Re-distribute if you want employees to receive the updated version."
            )

        if not was_distributed:
            try:
                if existing.upload_storage_key:
                    delete_file(existing.upload_storage_key)
            except Exception:
                pass

        existing.template_id = template_id
        existing.upload_storage_key = file_path
        existing.upload_mime_type = content_type
        existing.upload_original_filename = original_name

        # Always force fresh approval after replacing
        existing.status = "uploaded_needs_approval"
        existing.payroll_total = None
        existing.computed_total = None
        existing.discrepancy = None
        existing.approved_by_user_id = None
        existing.approved_at = None
        existing.distributed_at = None

        # Clear approval routing metadata if your DB has it
        _set_if_attr(existing, "approval_requested_to", None)
        _set_if_attr(existing, "approval_requested_by", None)
        _set_if_attr(existing, "approval_requested_at", None)
        _set_if_attr(existing, "rejected_by", None)
        _set_if_attr(existing, "rejected_at", None)
        _set_if_attr(existing, "rejection_reason", None)
        _set_if_attr(existing, "approved_by", None)
        _set_if_attr(existing, "approved_at", None)

        db.commit()
        db.refresh(existing)

        log_action(
            db,
            org_id,
            current_user_id,
            "replace_upload",
            "payroll_batch",
            existing.batch_id,
            {"month": month, "filename": original_name, "force": force, "was_distributed": was_distributed},
        )

        return {
            **PayrollBatchResponse.model_validate(existing).model_dump(),
            "replaced": True,
            "requires_approval": True,
            "warning": warning,
        }

    batch = PayrollBatch(
        org_id=org_id,
        period_year=year,
        period_month=mo,
        template_id=template_id,
        upload_storage_key=file_path,
        upload_mime_type=content_type,
        upload_original_filename=original_name,
        created_by_user_id=current_user_id,
        status="uploaded_needs_approval",  # require explicit approval before parse/distribute
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    log_action(db, org_id, current_user_id, "upload", "payroll_batch", batch.batch_id, {"month": month})
    return {
        **PayrollBatchResponse.model_validate(batch).model_dump(),
        "replaced": False,
        "requires_approval": True,
        "warning": None,
    }


@router.get("/batches", response_model=list[PayrollBatchResponse])
def list_batches(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    return (
        db.query(PayrollBatch)
        .filter(PayrollBatch.org_id == org_id)
        .order_by(PayrollBatch.created_at.desc())
        .all()
    )


@router.get("/batches/{batch_id}", response_model=PayrollBatchResponse)
def get_batch(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    batch = (
        db.query(PayrollBatch)
        .filter(PayrollBatch.batch_id == batch_id, PayrollBatch.org_id == org_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Payroll batch not found")
    return batch


@router.post("/batches/{batch_id}/parse")
def parse_payroll(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_admin),
):
    batch = (
        db.query(PayrollBatch)
        .filter(PayrollBatch.batch_id == batch_id, PayrollBatch.org_id == org_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Payroll batch not found")

    _ensure_approved_for_parse_or_distribute(batch)

    from app.services.file_storage import _get_s3, R2_BUCKET
    try:
        s3 = _get_s3()
        obj = s3.get_object(Bucket=R2_BUCKET, Key=batch.upload_storage_key)
        content = obj["Body"].read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read payroll file: {e}")

    filename = (
        getattr(batch, "upload_original_filename", None)
        or getattr(batch, "original_filename", None)
        or batch.upload_storage_key
    )
    result = parse_payroll_file(filename, content, db, org_id)

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    batch.payroll_total = result["total_gross"]
    batch.computed_total = result["total_net"]
    batch.discrepancy = round((result["total_gross"] - result["total_deductions"]) - result["total_net"], 2)
    batch.status = "parsed"
    db.commit()
    db.refresh(batch)

    month_str = f"{batch.period_year}-{batch.period_month:02d}"
    log_action(
        db,
        org_id,
        current_user_id,
        "parse",
        "payroll_batch",
        batch.batch_id,
        {
            "employee_count": result["employee_count"],
            "matched": result["matched_count"],
            "unmatched": len(result["unmatched_names"]),
        },
    )

    return {
        "batch_id": str(batch.batch_id),
        "month": month_str,
        "total_gross": result["total_gross"],
        "total_deductions": result["total_deductions"],
        "total_net": result["total_net"],
        "employee_count": result["employee_count"],
        "matched_count": result["matched_count"],
        "unmatched_names": result["unmatched_names"],
        "reconciled": result["reconciled"],
        "entries": result["entries"],
    }


@router.get("/batches/{batch_id}/verify")
def verify_payroll(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    batch = (
        db.query(PayrollBatch)
        .filter(PayrollBatch.batch_id == batch_id, PayrollBatch.org_id == org_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Payroll batch not found")
    if batch.status in ("uploaded", "uploaded_needs_approval"):
        raise HTTPException(status_code=400, detail="Payroll not yet parsed. Call /parse first.")

    from app.services.file_storage import _get_s3, R2_BUCKET
    try:
        s3 = _get_s3()
        obj = s3.get_object(Bucket=R2_BUCKET, Key=batch.upload_storage_key)
        content = obj["Body"].read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read payroll file: {e}")

    filename = (
        getattr(batch, "upload_original_filename", None)
        or getattr(batch, "original_filename", None)
        or batch.upload_storage_key
    )
    result = parse_payroll_file(filename, content, db, org_id)

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    month_str = f"{batch.period_year}-{batch.period_month:02d}"
    return {
        "batch_id": str(batch.batch_id),
        "month": month_str,
        "total_gross": result["total_gross"],
        "total_deductions": result["total_deductions"],
        "total_net": result["total_net"],
        "employee_count": result["employee_count"],
        "matched_count": result["matched_count"],
        "unmatched_names": result["unmatched_names"],
        "reconciled": result["reconciled"],
        "entries": result["entries"],
    }


@router.post("/batches/{batch_id}/distribute")
def distribute_payslips(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_admin),
):
    batch = (
        db.query(PayrollBatch)
        .filter(PayrollBatch.batch_id == batch_id, PayrollBatch.org_id == org_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Payroll batch not found")

    _ensure_approved_for_parse_or_distribute(batch)

    if batch.status == "uploaded":
        raise HTTPException(status_code=400, detail="Payroll not yet parsed")
    if batch.status == "distributed":
        raise HTTPException(status_code=400, detail="Already distributed")

    from app.services.file_storage import _get_s3, R2_BUCKET
    try:
        s3 = _get_s3()
        obj = s3.get_object(Bucket=R2_BUCKET, Key=batch.upload_storage_key)
        content = obj["Body"].read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read payroll file: {e}")

    filename = (
        getattr(batch, "upload_original_filename", None)
        or getattr(batch, "original_filename", None)
        or batch.upload_storage_key
    )
    result = parse_payroll_file(filename, content, db, org_id)

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    entries = result["entries"]
    month_str = f"{batch.period_year}-{batch.period_month:02d}"
    distributed_count = 0

    for entry in entries:
        user_id_str = entry.get("matched_user_id")
        if not user_id_str:
            continue

        user_id = uuid.UUID(user_id_str)

        doc = EmployeeDocument(
            user_id=user_id,
            org_id=org_id,
            doc_type="payslip",
            title=f"Payslip - {month_str}",
            file_path=batch.upload_storage_key,
            original_filename=f"payslip_{month_str}.pdf",
            mime_type=batch.upload_mime_type,
            file_size=0,
            uploaded_by=current_user_id,
        )
        db.add(doc)
        db.flush()

        payslip = Payslip(
            org_id=org_id,
            batch_id=batch.batch_id,
            employee_user_id=user_id,
            gross_pay=entry.get("gross_salary"),
            total_deductions=entry.get("deductions"),
            net_pay=entry.get("net_salary"),
            document_id=doc.id,
        )
        db.add(payslip)
        distributed_count += 1

    batch.status = "distributed"
    batch.distributed_at = _now_utc()
    db.commit()

    log_action(
        db,
        org_id,
        current_user_id,
        "distribute",
        "payroll_batch",
        batch.batch_id,
        {"month": month_str, "distributed_count": distributed_count},
    )

    return {"ok": True, "message": f"Distributed {distributed_count} payslips", "distributed_count": distributed_count}


# ─────────────────────────────────────────────────────────────
# Employee Payslip Views
# ─────────────────────────────────────────────────────────────
@router.get("/my-payslips", response_model=list[PayslipResponse])
def list_my_payslips(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    return (
        db.query(Payslip)
        .filter(Payslip.employee_user_id == current_user_id, Payslip.org_id == org_id)
        .order_by(Payslip.created_at.desc())
        .all()
    )


@router.get("/my-payslips/{payslip_id}/download")
def download_my_payslip(
    payslip_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    payslip = (
        db.query(Payslip)
        .filter(
            Payslip.payslip_id == payslip_id,
            Payslip.employee_user_id == current_user_id,
            Payslip.org_id == org_id,
        )
        .first()
    )
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")
    if payslip.document_id:
        doc = db.query(EmployeeDocument).filter(EmployeeDocument.id == payslip.document_id).first()
        if doc:
            url = get_download_url(doc.file_path)
            return {"url": url}

    raise HTTPException(status_code=404, detail="Payslip document not found")
