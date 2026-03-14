# backend/app/routers/payroll.py

import csv
import io
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.dependencies import (
    get_current_org_id,
    get_current_user_id,
    get_current_user,
    get_current_role,
    require_admin,
    require_payroll_access,
    require_can_approve_payroll,
    require_can_parse_payroll,
    require_can_distribute_payroll,
)
from app.models.payroll import PayrollTemplate, PayrollBatch, Payslip, PayrollRunAdjustment
from app.models.employee_document import EmployeeDocument
from app.models.employee_profile import EmployeeProfile
from app.models.user import User  # users_legacy
from app.models.audit_log import AuditLog
from app.models.message import DmConversation, DmMessage, ConversationParticipant
from app.schemas.payroll import (
    PayrollTemplateResponse,
    PayrollBatchResponse,
    PayslipResponse,
    RunAdjustmentUpsertBody,
)
from app.services.file_storage import save_upload, save_bytes, get_download_url, delete_file
from app.services.audit import log_action
from app.services.payroll_parser import parse_payroll_file
from app.services.payslip_generator import generate_payslip_pdf

router = APIRouter(prefix="/api/v1/payroll", tags=["Payroll"])

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

# Flow: Thomas (creator) → Finance manager (can_authorize_payroll) approves → HR admin parses/verifies/distributes


def _require_payroll_processor(user: User | None) -> None:
    if not user or not bool(getattr(user, "can_process_payroll", False)):
        raise HTTPException(status_code=403, detail="Payroll processing permission required")


def _build_run_rows(db: Session, org_id: uuid.UUID, year_i: int, month_i: int):
    """
    Build payroll rows for a period using employee profiles and any saved run adjustments.
    Used for run-preview (pass-through validation) and for run_monthly_payroll.
    Tax logic: gross = base + bonus; statutory from _calculate_kenya(gross, pension, insurance);
    post-tax deductions (loan, other) reduce net only.
    """
    from app.routers import payroll_statutory

    effective_on = date(year_i, month_i, 1)
    cfg = payroll_statutory._get_config(db, org_id, effective_on=effective_on)

    users = (
        db.query(User)
        .filter(User.org_id == org_id, User.is_active == True)
        .all()
    )
    adjustments_by_user = {
        a.user_id: a
        for a in db.query(PayrollRunAdjustment).filter(
            PayrollRunAdjustment.org_id == org_id,
            PayrollRunAdjustment.period_year == year_i,
            PayrollRunAdjustment.period_month == month_i,
        ).all()
    }

    rows = []
    for u in users:
        profile = db.query(EmployeeProfile).filter(
            EmployeeProfile.org_id == org_id,
            EmployeeProfile.user_id == u.user_id,
        ).first()
        base_salary = float(profile.monthly_salary or 0) if profile else 0.0
        adj = adjustments_by_user.get(u.user_id)

        if adj:
            if adj.base_salary_override is not None:
                base_salary = float(adj.base_salary_override)
            bonus = float(adj.bonus or 0)
            pension_opt = float(adj.pension_optional or 0)
            insurance_basis = float(adj.insurance_relief_basis or 0)
            loan = float(adj.loan_repayment or 0)
            other = float(adj.other_deductions or 0)
            notes = adj.notes
        else:
            bonus = pension_opt = insurance_basis = loan = other = 0.0
            notes = None

        gross = base_salary + bonus
        if gross <= 0:
            continue

        calc = payroll_statutory._calculate_kenya(
            gross_pay=gross,
            pension_contribution=pension_opt,
            insurance_relief_basis=insurance_basis,
            cfg=cfg,
        )
        statutory_total = calc["statutory_total"]
        total_deductions = statutory_total + pension_opt + loan + other
        net = round(gross - total_deductions, 2)

        name = (u.name or u.email or "Unknown").strip() or "Unknown"
        rows.append({
            "user_id": u.user_id,
            "employee_name": name,
            "base_salary": round(base_salary, 2),
            "bonus": round(bonus, 2),
            "gross": round(gross, 2),
            "paye": calc["paye"],
            "nssf": calc["nssf"],
            "shif": calc["shif"],
            "ahl": calc["ahl"],
            "statutory_total": statutory_total,
            "pension_optional": round(pension_opt, 2),
            "loan_repayment": round(loan, 2),
            "other_deductions": round(other, 2),
            "total_deductions": round(total_deductions, 2),
            "net": net,
            "adjustment": {
                "base_salary_override": float(adj.base_salary_override) if adj and adj.base_salary_override is not None else None,
                "bonus": float(adj.bonus) if adj else 0,
                "pension_optional": float(adj.pension_optional) if adj else 0,
                "insurance_relief_basis": float(adj.insurance_relief_basis) if adj else 0,
                "loan_repayment": float(adj.loan_repayment) if adj else 0,
                "other_deductions": float(adj.other_deductions) if adj else 0,
                "notes": adj.notes if adj else None,
            } if adj else None,
        })
    return rows


def _get_or_create_system_template(db: Session, org_id: uuid.UUID, created_by_user_id: uuid.UUID) -> PayrollTemplate:
    """Return the 'System generated' payroll template for this org, creating it if needed."""
    tmpl = (
        db.query(PayrollTemplate)
        .filter(PayrollTemplate.org_id == org_id, PayrollTemplate.title == "System generated")
        .first()
    )
    if tmpl:
        return tmpl
    # Create placeholder CSV and upload so we have a valid template
    placeholder = b"employee_name,gross_salary,deductions,net_salary\n"
    key = f"payroll_uploads/{org_id}/system_placeholder.csv"
    save_bytes(placeholder, key, "text/csv")
    tmpl = PayrollTemplate(
        org_id=org_id,
        title="System generated",
        storage_key=key,
        mime_type="text/csv",
        created_by_user_id=created_by_user_id,
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return tmpl


@router.post("/run-monthly", response_model=PayrollBatchUploadResponse)
def run_monthly_payroll(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    current_user: User | None = Depends(get_current_user),
):
    """
    Auto-build a payroll batch from employee monthly_salary and statutory config.

    Only users with 'can_process_payroll' may call this. Creates a CSV, uploads to R2,
    and creates a batch in status uploaded_needs_approval so it goes through approval → parse → distribute.
    """
    _require_payroll_processor(current_user)

    year, month_num = month.split("-")
    try:
        year_i = int(year)
        month_i = int(month_num)
        if not (1 <= month_i <= 12):
            raise ValueError
    except ValueError:
        raise HTTPException(status_code=400, detail="month must be in YYYY-MM format")

    rows = _build_run_rows(db, org_id, year_i, month_i)
    if not rows:
        raise HTTPException(
            status_code=400,
            detail="No employees with monthly salary set. Add monthly_salary to employee profiles and try again.",
        )

    # Build CSV (same columns as before; run adjustments already applied in _build_run_rows)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["employee_name", "gross_salary", "deductions", "net_salary"])
    writer.writeheader()
    for r in rows:
        writer.writerow({
            "employee_name": r["employee_name"],
            "gross_salary": r["gross"],
            "deductions": r["total_deductions"],
            "net_salary": r["net"],
        })
    csv_bytes = buf.getvalue().encode("utf-8")

    # Upload generated CSV
    filename = f"payroll-{month}-system.csv"
    r2_key = f"payroll_uploads/{org_id}/{uuid.uuid4().hex}.csv"
    save_bytes(csv_bytes, r2_key, "text/csv")

    template = _get_or_create_system_template(db, org_id, current_user_id)

    existing = (
        db.query(PayrollBatch)
        .filter(
            PayrollBatch.org_id == org_id,
            PayrollBatch.period_year == year_i,
            PayrollBatch.period_month == month_i,
        )
        .first()
    )

    if existing:
        if existing.status == "distributed":
            batch = PayrollBatch(
                org_id=org_id,
                period_year=year_i,
                period_month=month_i,
                template_id=template.template_id,
                upload_storage_key=r2_key,
                upload_mime_type="text/csv",
                upload_original_filename=filename,
                created_by_user_id=current_user_id,
                status="uploaded_needs_approval",
            )
            db.add(batch)
            db.commit()
            db.refresh(batch)
            log_action(
                db, org_id, current_user_id, "run_monthly_payroll", "payroll_batch", batch.batch_id,
                {"month": month, "employee_count": len(rows), "previous_distributed": str(existing.batch_id)},
            )
            _auto_send_payroll_approval_request(db, org_id=org_id, batch=batch, requested_by_user_id=current_user_id)
            db.refresh(batch)
            return {
                **PayrollBatchResponse.model_validate(batch).model_dump(),
                "replaced": False,
                "requires_approval": True,
                "warning": f"A distributed payroll for {month} already exists. New batch created and needs approval.",
            }
        try:
            if existing.upload_storage_key:
                delete_file(existing.upload_storage_key)
        except Exception:
            pass
        existing.template_id = template.template_id
        existing.upload_storage_key = r2_key
        existing.upload_mime_type = "text/csv"
        existing.upload_original_filename = filename
        existing.status = "uploaded_needs_approval"
        existing.payroll_total = None
        existing.computed_total = None
        existing.discrepancy = None
        existing.approved_by_user_id = None
        existing.approved_at = None
        existing.distributed_at = None
        db.commit()
        db.refresh(existing)
        log_action(
            db, org_id, current_user_id, "run_monthly_payroll", "payroll_batch", existing.batch_id,
            {"month": month, "employee_count": len(rows)},
        )
        _auto_send_payroll_approval_request(db, org_id=org_id, batch=existing, requested_by_user_id=current_user_id)
        db.refresh(existing)
        return {
            **PayrollBatchResponse.model_validate(existing).model_dump(),
            "replaced": True,
            "requires_approval": True,
        }

    batch = PayrollBatch(
        org_id=org_id,
        period_year=year_i,
        period_month=month_i,
        template_id=template.template_id,
        upload_storage_key=r2_key,
        upload_mime_type="text/csv",
        upload_original_filename=filename,
        created_by_user_id=current_user_id,
        status="uploaded_needs_approval",
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    log_action(
        db, org_id, current_user_id, "run_monthly_payroll", "payroll_batch", batch.batch_id,
        {"month": month, "employee_count": len(rows)},
    )
    _auto_send_payroll_approval_request(db, org_id=org_id, batch=batch, requested_by_user_id=current_user_id)
    db.refresh(batch)
    return {
        **PayrollBatchResponse.model_validate(batch).model_dump(),
        "replaced": False,
        "requires_approval": True,
        "warning": None,
    }


@router.get("/run-preview")
def get_run_preview(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user: User | None = Depends(get_current_user),
):
    """
    For Thomas (can_process_payroll): preview payroll for a month with pass-through validation.
    Returns per-employee rows with base, adjustments, and computed statutory (PAYE, NSSF, SHIF, AHL) and net.
    """
    _require_payroll_processor(current_user)
    year, month_num = month.split("-")
    year_i, month_i = int(year), int(month_num)
    if not (1 <= month_i <= 12):
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")
    rows = _build_run_rows(db, org_id, year_i, month_i)
    return {"month": month, "rows": rows}


@router.get("/run-adjustments")
def list_run_adjustments(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user: User | None = Depends(get_current_user),
):
    """List saved run adjustments for the given month (Thomas / can_process_payroll)."""
    _require_payroll_processor(current_user)
    year, month_num = month.split("-")
    year_i, month_i = int(year), int(month_num)
    if not (1 <= month_i <= 12):
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")
    adjustments = (
        db.query(PayrollRunAdjustment)
        .filter(
            PayrollRunAdjustment.org_id == org_id,
            PayrollRunAdjustment.period_year == year_i,
            PayrollRunAdjustment.period_month == month_i,
        )
        .all()
    )
    return {
        "month": month,
        "adjustments": [
            {
                "user_id": str(a.user_id),
                "base_salary_override": float(a.base_salary_override) if a.base_salary_override is not None else None,
                "bonus": float(a.bonus or 0),
                "pension_optional": float(a.pension_optional or 0),
                "insurance_relief_basis": float(a.insurance_relief_basis or 0),
                "loan_repayment": float(a.loan_repayment or 0),
                "other_deductions": float(a.other_deductions or 0),
                "notes": a.notes,
            }
            for a in adjustments
        ],
    }


@router.put("/run-adjustments")
def upsert_run_adjustments(
    body: RunAdjustmentUpsertBody = Body(...),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user: User | None = Depends(get_current_user),
):
    """
    Upsert run adjustments for a month. Thomas can set per-employee bonus, deductions, pension, loans.
    Pass-through uses the same statutory formula as run_monthly_payroll and batch validation.
    """
    _require_payroll_processor(current_user)
    year, month_num = body.month.split("-")
    year_i, month_i = int(year), int(month_num)
    if not (1 <= month_i <= 12):
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")
    for adj in body.adjustments:
        rec = (
            db.query(PayrollRunAdjustment)
            .filter(
                PayrollRunAdjustment.org_id == org_id,
                PayrollRunAdjustment.period_year == year_i,
                PayrollRunAdjustment.period_month == month_i,
                PayrollRunAdjustment.user_id == adj.user_id,
            )
            .first()
        )
        if rec:
            rec.base_salary_override = adj.base_salary_override
            rec.bonus = adj.bonus
            rec.pension_optional = adj.pension_optional
            rec.insurance_relief_basis = adj.insurance_relief_basis
            rec.loan_repayment = adj.loan_repayment
            rec.other_deductions = adj.other_deductions
            rec.notes = adj.notes
        else:
            db.add(
                PayrollRunAdjustment(
                    org_id=org_id,
                    period_year=year_i,
                    period_month=month_i,
                    user_id=adj.user_id,
                    base_salary_override=adj.base_salary_override,
                    bonus=adj.bonus,
                    pension_optional=adj.pension_optional,
                    insurance_relief_basis=adj.insurance_relief_basis,
                    loan_repayment=adj.loan_repayment,
                    other_deductions=adj.other_deductions,
                    notes=adj.notes,
                )
            )
    db.commit()
    return {"month": body.month, "saved": len(body.adjustments)}


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


def _month_str(batch: PayrollBatch) -> str:
    return f"{batch.period_year}-{batch.period_month:02d}"


def _require_pending_approval(batch: PayrollBatch):
    status = getattr(batch, "status", None)
    if status == "distributed":
        raise HTTPException(status_code=409, detail="This payroll has already been distributed. No further approval actions are allowed.")
    if status != "uploaded_needs_approval":
        raise HTTPException(status_code=400, detail=f"Batch is not pending approval (status={status})")


def _ensure_approved_for_parse_or_distribute(batch: PayrollBatch):
    if batch.status == "uploaded_needs_approval":
        raise HTTPException(status_code=409, detail="Payroll batch requires approval before proceeding.")


def _get_or_create_direct_conversation(
    db: Session,
    *,
    org_id: uuid.UUID,
    a_user_id: uuid.UUID,
    b_user_id: uuid.UUID,
) -> DmConversation:
    """
    Return existing 1:1 conversation between a and b in this org, or create it.
    This writes into the SAME DM system your UI reads (/api/v1/messages/...).
    """
    a_convos = db.query(ConversationParticipant.conversation_id).filter(
        ConversationParticipant.user_id == a_user_id
    )
    b_convos = db.query(ConversationParticipant.conversation_id).filter(
        ConversationParticipant.user_id == b_user_id
    )

    convo = (
        db.query(DmConversation)
        .filter(
            DmConversation.org_id == org_id,
            DmConversation.is_group == False,  # noqa: E712
            DmConversation.id.in_(a_convos),
            DmConversation.id.in_(b_convos),
        )
        .first()
    )
    if convo:
        return convo

    convo = DmConversation(org_id=org_id, is_group=False, title=None)
    db.add(convo)
    db.flush()

    db.add(ConversationParticipant(conversation_id=convo.id, user_id=a_user_id))
    db.add(ConversationParticipant(conversation_id=convo.id, user_id=b_user_id))
    db.flush()

    return convo


def _auto_send_payroll_approval_request(
    db: Session,
    *,
    org_id: uuid.UUID,
    batch: PayrollBatch,
    requested_by_user_id: uuid.UUID,
) -> None:
    """
    After run_monthly or upload creates a batch in uploaded_needs_approval,
    send approval request to finance manager(s) (can_authorize_payroll). They approve; then HR admin parses/verifies/distributes.
    """
    approvers = (
        db.query(User)
        .filter(User.org_id == org_id, User.is_active == True)  # noqa: E712
        .all()
    )
    # Finance managers (can_authorize_payroll) are the approvers
    candidates = [
        u for u in approvers
        if u.user_id != requested_by_user_id
        and bool(getattr(u, "can_authorize_payroll", False))
    ]
    if not candidates:
        # Fallback to super_admin if no finance manager
        candidates = [
            u for u in approvers
            if u.user_id != requested_by_user_id
            and str(getattr(u, "role", "") or "") == "super_admin"
        ]
    candidates.sort(key=lambda u: (getattr(u, "name", None) or getattr(u, "email", "") or "").lower())
    if not candidates:
        return
    approver = candidates[0]
    _set_if_attr(batch, "approval_requested_to", approver.user_id)
    _set_if_attr(batch, "approval_requested_by", requested_by_user_id)
    _set_if_attr(batch, "approval_requested_at", _now_utc())
    _send_payroll_approval_dm(
        db,
        org_id=org_id,
        sender_id=requested_by_user_id,
        recipient_id=approver.user_id,
        batch=batch,
    )
    # Notify other finance managers that payroll is awaiting their (or a colleague's) approval
    month_str = _month_str(batch)
    for u in candidates[1:]:
        _send_simple_dm(
            db,
            org_id=org_id,
            sender_id=requested_by_user_id,
            recipient_id=u.user_id,
            text=f"📋 Payroll for {month_str} has been submitted and is **awaiting finance manager approval**.",
        )
    db.commit()


def _send_payroll_approval_dm(
    db: Session,
    *,
    org_id: uuid.UUID,
    sender_id: uuid.UUID,
    recipient_id: uuid.UUID,
    batch: PayrollBatch,
):
    """
    Sends the approval request into the SAME DM system your UI shows.
    We embed a marker block so the frontend can render Approve/Reject buttons.
    """
    fname = getattr(batch, "upload_original_filename", None) or "Payroll file"

    download_url = None
    try:
        if getattr(batch, "upload_storage_key", None):
            download_url = get_download_url(batch.upload_storage_key)
    except Exception:
        download_url = None

    payload = {
        "kind": "payroll_approval_request",
        "batch_id": str(batch.batch_id),
        "month": _month_str(batch),
        "filename": fname,
        "download_url": download_url,
        "approve_endpoint": f"/api/v1/payroll/batches/{batch.batch_id}/approve",
        "reject_endpoint": f"/api/v1/payroll/batches/{batch.batch_id}/reject",
    }

    import json

    dm_text = (
        f"📌 Payroll approval requested\n"
        f"Month: {payload['month']}\n"
        f"File: {payload['filename']}\n"
        f"Batch ID: {payload['batch_id']}\n"
        f"Download: {payload['download_url'] or 'Unavailable'}\n\n"
        f"[[PAYROLL_APPROVAL]]{json.dumps(payload)}[[/PAYROLL_APPROVAL]]"
    )

    convo = _get_or_create_direct_conversation(
        db,
        org_id=org_id,
        a_user_id=sender_id,
        b_user_id=recipient_id,
    )

    msg = DmMessage(conversation_id=convo.id, sender_id=sender_id, content=dm_text)
    db.add(msg)


def _send_simple_dm(
    db: Session,
    *,
    org_id: uuid.UUID,
    sender_id: uuid.UUID,
    recipient_id: uuid.UUID,
    text: str,
):
    convo = _get_or_create_direct_conversation(
        db,
        org_id=org_id,
        a_user_id=sender_id,
        b_user_id=recipient_id,
    )
    db.add(DmMessage(conversation_id=convo.id, sender_id=sender_id, content=text))


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
    _user=Depends(require_payroll_access),
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
    _user=Depends(require_payroll_access),
):
    """Return finance managers (can_authorize_payroll) and super_admin as approvers."""
    users = (
        db.query(User)
        .filter(User.org_id == org_id, User.is_active == True)  # noqa: E712
        .all()
    )
    approvers = []
    for u in users:
        role_val = str(getattr(u, "role", "") or "")
        if role_val == "super_admin" or bool(getattr(u, "can_authorize_payroll", False)):
            approvers.append(
                {
                    "user_id": str(u.user_id),
                    "name": getattr(u, "name", None),
                    "email": getattr(u, "email", None),
                    "role": role_val,
                }
            )
    approvers.sort(key=lambda x: ((x.get("name") or "") + (x.get("email") or "")).lower())
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
    HR Admin selects an approver, then:
    - status becomes uploaded_needs_approval (blocked for parse/distribute)
    - store routing fields (if columns exist on PayrollBatch)
    - send a DM message to the approver (DmMessage) so it appears in UI
    """
    batch = (
        db.query(PayrollBatch)
        .filter(PayrollBatch.batch_id == batch_id, PayrollBatch.org_id == org_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Payroll batch not found")

    if batch.status == "distributed":
        raise HTTPException(status_code=409, detail="Cannot request approval for a distributed payroll batch")

    # Ensure approver exists in same org and active
    approver = (
        db.query(User)
        .filter(User.user_id == approver_user_id, User.org_id == org_id, User.is_active == True)  # noqa: E712
        .first()
    )
    if not approver:
        raise HTTPException(status_code=404, detail="Approver not found in this organization")

    approver_role = str(getattr(approver, "role", "") or "")
    if approver_role != "super_admin" and not bool(getattr(approver, "can_authorize_payroll", False)):
        raise HTTPException(status_code=400, detail="Selected user must be a finance manager to approve payroll")

    # mark pending approval
    batch.status = "uploaded_needs_approval"

    # Store routing fields if your DB has them (safe no-op if missing)
    _set_if_attr(batch, "approval_requested_to", approver_user_id)
    _set_if_attr(batch, "approval_requested_by", current_user_id)
    _set_if_attr(batch, "approval_requested_at", _now_utc())

    # Send the approval request into DM system
    _send_payroll_approval_dm(
        db,
        org_id=org_id,
        sender_id=current_user_id,
        recipient_id=approver_user_id,
        batch=batch,
    )
    # Notify finance managers (can_authorize_payroll) that payroll is awaiting HR approval
    month_str = _month_str(batch)
    authorizers = (
        db.query(User)
        .filter(
            User.org_id == org_id,
            User.is_active == True,  # noqa: E712
            User.user_id != current_user_id,
            User.user_id != approver_user_id,
        )
        .all()
    )
    authorizers = [u for u in authorizers if bool(getattr(u, "can_authorize_payroll", False))]
    for auth_user in authorizers:
        _send_simple_dm(
            db,
            org_id=org_id,
            sender_id=current_user_id,
            recipient_id=auth_user.user_id,
            text=f"📋 Payroll for {month_str} has been submitted and is **awaiting HR Admin approval**. You will be notified when it is approved.",
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

    download_url = None
    try:
        if getattr(batch, "upload_storage_key", None):
            download_url = get_download_url(batch.upload_storage_key)
    except Exception:
        download_url = None

    return {
        "ok": True,
        "batch_id": str(batch.batch_id),
        "status": batch.status,
        "sent_to": str(approver_user_id),
        "download_url": download_url,
    }


@router.post("/batches/{batch_id}/approve", response_model=PayrollBatchResponse)
def approve_batch(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _user=Depends(require_can_approve_payroll),
):
    """
    Finance manager approves. Status becomes 'uploaded' so HR Admin can parse, verify and distribute.
    """
    batch = (
        db.query(PayrollBatch)
        .filter(PayrollBatch.batch_id == batch_id, PayrollBatch.org_id == org_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Payroll batch not found")

    _require_pending_approval(batch)

    batch.approved_by_user_id = current_user_id
    batch.approved_at = _now_utc()

    _set_if_attr(batch, "approved_by", current_user_id)
    _set_if_attr(batch, "approved_at", batch.approved_at)

    batch.status = "uploaded"

    month_str = _month_str(batch)
    # Notify HR admins that they can now parse, verify and distribute
    hr_admins = (
        db.query(User)
        .filter(User.org_id == org_id, User.is_active == True, User.user_id != current_user_id)  # noqa: E712
        .all()
    )
    hr_admins = [u for u in hr_admins if str(getattr(u, "role", "") or "") in ("hr_admin", "super_admin")]
    for hr in hr_admins:
        _send_simple_dm(
            db,
            org_id=org_id,
            sender_id=current_user_id,
            recipient_id=hr.user_id,
            text=f"✅ Payroll approved for {month_str}. You can now parse, verify and distribute.",
        )
    if not hr_admins:
        requested_by = _get_if_attr(batch, "approval_requested_by", None)
        if requested_by and requested_by != current_user_id:
            _send_simple_dm(
                db,
                org_id=org_id,
                sender_id=current_user_id,
                recipient_id=requested_by,
                text=f"✅ Payroll approved for {month_str}. HR Admin can parse, verify and distribute.",
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
    current_user: User | None = Depends(get_current_user),
):
    """
    HR admin, finance manager (can_authorize_payroll), or the designated approver can reject.
    - Keep it blocked (uploaded_needs_approval).
    - Record rejection metadata if columns exist.
    """
    batch = (
        db.query(PayrollBatch)
        .filter(PayrollBatch.batch_id == batch_id, PayrollBatch.org_id == org_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Payroll batch not found")

    _require_pending_approval(batch)

    role = str(getattr(current_user, "role", "") or "") if current_user else ""
    requested_to = _get_if_attr(batch, "approval_requested_to", None)
    is_designated_approver = requested_to and str(requested_to) == str(current_user_id)
    can_reject = (
        is_designated_approver
        or role in ("hr_admin", "super_admin")
        or bool(getattr(current_user, "can_authorize_payroll", False))
    )
    if not can_reject:
        raise HTTPException(status_code=403, detail="Not authorized to reject this payroll batch")

    _set_if_attr(batch, "rejected_by", current_user_id)
    _set_if_attr(batch, "rejected_at", _now_utc())
    _set_if_attr(batch, "rejection_reason", reason or None)

    batch.status = "uploaded_needs_approval"

    requested_by = _get_if_attr(batch, "approval_requested_by", None)
    if requested_by:
        _send_simple_dm(
            db,
            org_id=org_id,
            sender_id=current_user_id,
            recipient_id=requested_by,
            text=f"❌ Payroll rejected for {_month_str(batch)}. Reason: {reason or 'Not provided'}",
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
        if existing.status == "distributed":
            # Distributed batches are immutable history — create a new batch for the re-upload
            warning = (
                f"⚠️ A distributed payroll for {month} already exists and has been preserved in history. "
                "This new upload will go through a fresh approval process."
            )
            batch = PayrollBatch(
                org_id=org_id,
                period_year=year,
                period_month=mo,
                template_id=template_id,
                upload_storage_key=file_path,
                upload_mime_type=content_type,
                upload_original_filename=original_name,
                created_by_user_id=current_user_id,
                status="uploaded_needs_approval",
            )
            db.add(batch)
            db.commit()
            db.refresh(batch)
            log_action(db, org_id, current_user_id, "re_upload", "payroll_batch", batch.batch_id,
                       {"month": month, "filename": original_name, "previous_batch_id": str(existing.batch_id)})
            return {
                **PayrollBatchResponse.model_validate(batch).model_dump(),
                "replaced": False,
                "requires_approval": True,
                "warning": warning,
            }

        # Non-distributed existing batch — replace in place (batch hasn't completed yet)
        try:
            if existing.upload_storage_key:
                delete_file(existing.upload_storage_key)
        except Exception:
            pass

        existing.template_id = template_id
        existing.upload_storage_key = file_path
        existing.upload_mime_type = content_type
        existing.upload_original_filename = original_name
        existing.status = "uploaded_needs_approval"
        existing.payroll_total = None
        existing.computed_total = None
        existing.discrepancy = None
        existing.approved_by_user_id = None
        existing.approved_at = None
        existing.distributed_at = None
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
        log_action(db, org_id, current_user_id, "replace_upload", "payroll_batch", existing.batch_id,
                   {"month": month, "filename": original_name})
        return {
            **PayrollBatchResponse.model_validate(existing).model_dump(),
            "replaced": True,
            "requires_approval": True,
            "warning": None,
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
        status="uploaded_needs_approval",
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
    _user: User = Depends(require_payroll_access),
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
    _user: User = Depends(require_payroll_access),
):
    batch = (
        db.query(PayrollBatch)
        .filter(PayrollBatch.batch_id == batch_id, PayrollBatch.org_id == org_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Payroll batch not found")
    return batch


@router.get("/batches/{batch_id}/download")
def download_batch_file(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _user: User = Depends(require_payroll_access),
):
    """Return a presigned download URL for the uploaded payroll file."""
    batch = (
        db.query(PayrollBatch)
        .filter(PayrollBatch.batch_id == batch_id, PayrollBatch.org_id == org_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Payroll batch not found")
    if not batch.upload_storage_key:
        raise HTTPException(status_code=404, detail="No file attached to this batch")
    url = get_download_url(batch.upload_storage_key)
    return {"url": url, "filename": batch.upload_original_filename}


def _user_display_name(db: Session, user_id: uuid.UUID | None) -> str:
    if not user_id:
        return ""
    u = db.query(User).filter(User.user_id == user_id).first()
    if not u:
        return str(user_id)
    return (getattr(u, "name", None) or getattr(u, "email", None) or str(user_id)) or ""


def _get_approval_trail(db: Session, org_id: uuid.UUID, batch: PayrollBatch) -> dict:
    created_by = getattr(batch, "created_by_user_id", None)
    approved_by = getattr(batch, "approved_by_user_id", None)
    approved_at = getattr(batch, "approved_at", None)
    distributed_at = getattr(batch, "distributed_at", None)
    distributed_by = None
    distributed_at_from_audit = None
    if batch.status == "distributed":
        last_distribute = (
            db.query(AuditLog)
            .filter(
                AuditLog.org_id == org_id,
                AuditLog.resource_type == "payroll_batch",
                AuditLog.resource_id == str(batch.batch_id),
                AuditLog.action == "distribute",
            )
            .order_by(AuditLog.created_at.desc())
            .first()
        )
        if last_distribute:
            distributed_by = last_distribute.user_id
            distributed_at_from_audit = last_distribute.created_at
    return {
        "requested_by": {
            "user_id": str(created_by) if created_by else None,
            "name": _user_display_name(db, created_by),
            "role_label": "Requested / Created by",
        },
        "approved_by": {
            "user_id": str(approved_by) if approved_by else None,
            "name": _user_display_name(db, approved_by),
            "at": approved_at.isoformat() if approved_at else None,
            "role_label": "Approved by",
        },
        "distributed_by": {
            "user_id": str(distributed_by) if distributed_by else None,
            "name": _user_display_name(db, distributed_by),
            "at": (distributed_at_from_audit or distributed_at).isoformat() if (distributed_at_from_audit or distributed_at) else None,
            "role_label": "Distributed by",
        },
    }


@router.get("/batches/{batch_id}/approval-trail")
def get_batch_approval_trail(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _user: User = Depends(require_payroll_access),
):
    """Return the 3 people involved: requested/created by, approved by, distributed by (with names and dates)."""
    batch = (
        db.query(PayrollBatch)
        .filter(PayrollBatch.batch_id == batch_id, PayrollBatch.org_id == org_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Payroll batch not found")
    return _get_approval_trail(db, org_id, batch)


@router.get("/batches/{batch_id}/export-csv")
def export_batch_csv_with_summary(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _user: User = Depends(require_payroll_access),
):
    """Download CSV of payroll data plus per-employee PAYE/NSSF/SHIF/AHL, statutory validation, filing summary, and signature lines."""
    from app.routers.payroll_statutory import _load_batch_parse_result, _get_config, _build_batch_validation, _calculate_kenya, _extract_detail_amount
    from datetime import date as date_type

    batch_dict, result = _load_batch_parse_result(db, org_id, batch_id)
    effective_on = date_type(int(batch_dict["period_year"]), int(batch_dict["period_month"]), 1)
    cfg = _get_config(db, org_id, effective_on=effective_on)
    validation = _build_batch_validation(result, cfg)
    summary = validation["summary"]
    entries = result.get("entries", [])

    batch_orm = db.query(PayrollBatch).filter(PayrollBatch.batch_id == batch_id, PayrollBatch.org_id == org_id).first()
    trail = _get_approval_trail(db, org_id, batch_orm) if batch_orm else {}

    buf = io.StringIO()
    writer = csv.writer(buf)

    writer.writerow(["employee_name", "gross_salary", "deductions", "net_salary", "paye", "nssf", "shif", "ahl", "total_statutory"])
    for e in entries:
        gross = float(e.get("gross_salary") or 0)
        details = e.get("details") or {}
        pension = _extract_detail_amount(details, "pension", "voluntary_pension")
        insurance_basis = _extract_detail_amount(details, "insurance", "relief_basis")
        statutory = _calculate_kenya(gross, pension, insurance_basis, cfg)
        writer.writerow([
            e.get("employee_name", ""),
            gross,
            e.get("deductions", 0),
            e.get("net_salary", 0),
            round(statutory.get("paye", 0), 2),
            round(statutory.get("nssf", 0), 2),
            round(statutory.get("shif", 0), 2),
            round(statutory.get("ahl", 0), 2),
            round(statutory.get("statutory_total", 0), 2),
        ])
    writer.writerow([])

    writer.writerow(["Statutory Validation"])
    writer.writerow(["Within Tolerance", summary.get("within_tolerance_count", 0)])
    writer.writerow(["Needs Review", summary.get("needs_review_count", 0)])
    writer.writerow(["Declared Statutory", summary.get("declared_statutory", 0)])
    writer.writerow(["Expected Statutory", summary.get("expected_statutory", 0)])
    writer.writerow([])

    writer.writerow(["Filing Summary"])
    writer.writerow(["PAYE", summary.get("declared_paye", 0)])
    writer.writerow(["NSSF", summary.get("declared_nssf", 0)])
    writer.writerow(["SHIF", summary.get("declared_shif", 0)])
    writer.writerow(["AHL", summary.get("declared_ahl", 0)])
    writer.writerow(["TOTAL_STATUTORY", summary.get("declared_statutory", 0)])
    writer.writerow([])

    writer.writerow(["Signatures"])
    writer.writerow([trail["requested_by"]["role_label"], trail["requested_by"]["name"], "Signature: _________________________"])
    writer.writerow([trail["approved_by"]["role_label"], trail["approved_by"]["name"], "Signature: _________________________"])
    writer.writerow([trail["distributed_by"]["role_label"], trail["distributed_by"]["name"], "Signature: _________________________"])

    buf.seek(0)
    period = f'{batch_dict["period_year"]}-{int(batch_dict["period_month"]):02d}'
    filename = f"payroll_batch_{period}_with_summary.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/batches/{batch_id}/parse")
def parse_payroll(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _user=Depends(require_can_parse_payroll),
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

    month_str = _month_str(batch)
    log_action(
        db,
        org_id,
        current_user_id,
        "parse",
        "payroll_batch",
        batch.batch_id,
        {
            "month": month_str,
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


@router.get("/batches/{batch_id}/preview")
def preview_batch_statutory(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _user: User = Depends(require_payroll_access),
):
    """
    For batches in uploaded or uploaded_needs_approval: return per-employee statutory
    breakdown (PAYE, NSSF, SHIF, housing levy, etc.) so approvers can review before approving.
    Does not change batch status.
    """
    batch = (
        db.query(PayrollBatch)
        .filter(PayrollBatch.batch_id == batch_id, PayrollBatch.org_id == org_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Payroll batch not found")
    if batch.status not in ("uploaded", "uploaded_needs_approval"):
        raise HTTPException(status_code=400, detail="Preview only available for batches not yet parsed")

    from app.services.file_storage import _get_s3, R2_BUCKET
    from datetime import date as date_type
    from app.routers import payroll_statutory

    try:
        s3 = _get_s3()
        obj = s3.get_object(Bucket=R2_BUCKET, Key=batch.upload_storage_key)
        content = obj["Body"].read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read payroll file: {e}") from e
    filename = (
        getattr(batch, "upload_original_filename", None)
        or getattr(batch, "original_filename", None)
        or batch.upload_storage_key
    )
    result = parse_payroll_file(filename, content, db, org_id)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    effective_on = date_type(batch.period_year, batch.period_month, 1)
    cfg = payroll_statutory._get_config(db, org_id, effective_on=effective_on)
    personal_relief = float(cfg.get("personal_relief") or 0)

    entries = []
    totals = {"gross_pay": 0.0, "paye": 0.0, "nssf": 0.0, "shif": 0.0, "ahl": 0.0, "statutory_total": 0.0, "estimated_net_pay": 0.0}
    for e in result.get("entries", []):
        gross = float(e.get("gross_salary") or 0)
        calc = payroll_statutory._calculate_kenya(gross, 0.0, 0.0, cfg)
        row = {
            "employee_name": e.get("employee_name") or "",
            "gross_pay": round(gross, 2),
            "paye": calc["paye"],
            "nssf": calc["nssf"],
            "shif": calc["shif"],
            "ahl": calc["ahl"],
            "personal_relief": personal_relief,
            "statutory_total": calc["statutory_total"],
            "estimated_net_pay": calc["estimated_net_pay"],
        }
        entries.append(row)
        totals["gross_pay"] += row["gross_pay"]
        totals["paye"] += row["paye"]
        totals["nssf"] += row["nssf"]
        totals["shif"] += row["shif"]
        totals["ahl"] += row["ahl"]
        totals["statutory_total"] += row["statutory_total"]
        totals["estimated_net_pay"] += row["estimated_net_pay"]

    totals = {k: round(v, 2) for k, v in totals.items()}
    return {
        "batch_id": str(batch.batch_id),
        "month": _month_str(batch),
        "entries": entries,
        "totals": totals,
        "employee_count": len(entries),
    }


@router.get("/batches/{batch_id}/verify")
def verify_payroll(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _user=Depends(require_payroll_access),
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

    month_str = _month_str(batch)
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
    _user=Depends(require_can_distribute_payroll),
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
    month_str = _month_str(batch)
    distributed_count = 0

    # Fetch org name and logo for payslip PDF
    from app.models.user import Organization
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    org_name = org.name if org else "Organisation"

    logo_bytes = None
    if org and getattr(org, "logo_storage_key", None):
        try:
            from app.services.file_storage import _get_s3, R2_BUCKET
            s3 = _get_s3()
            logo_bytes = s3.get_object(Bucket=R2_BUCKET, Key=org.logo_storage_key)["Body"].read()
        except Exception:
            logo_bytes = None

    # Statutory config for batch period (for payslip breakdown: NSSF, SHIF, housing, PAYE)
    from datetime import date as date_type
    from app.routers import payroll_statutory
    effective_on = date_type(batch.period_year, batch.period_month, 1)
    statutory_cfg = payroll_statutory._get_config(db, org_id, effective_on=effective_on)

    # Delete any orphaned payslips from previous failed/partial distribute attempts
    db.query(Payslip).filter(Payslip.batch_id == batch.batch_id).delete()
    db.flush()

    try:
        for entry in entries:
            user_id_str = entry.get("matched_user_id")
            if not user_id_str:
                continue

            user_id = uuid.UUID(user_id_str)
            gross = float(entry.get("gross_salary") or 0)

            # Fetch employment number from profile
            from app.models.employee_profile import EmployeeProfile
            profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
            emp_number = profile.employment_number if profile else None

            # Statutory breakdown for standard payslip format (NSSF, SHIF, housing before tax; then PAYE)
            calc = payroll_statutory._calculate_kenya(gross, 0.0, 0.0, statutory_cfg)
            total_deductions = float(entry.get("deductions") or 0)
            net_salary = float(entry.get("net_salary") or 0)
            if calc["statutory_total"] and (total_deductions == 0 or abs(total_deductions - calc["statutory_total"]) < 0.02):
                total_deductions = calc["statutory_total"]
                net_salary = calc["estimated_net_pay"]

            # Generate individual payslip PDF (standard format: Basic → deductions before tax → Taxable → Income Tax → Personal Relief → P.A.Y.E → Pay After Tax → Net Pay)
            pdf_bytes = generate_payslip_pdf(
                org_name=org_name,
                employee_name=entry.get("employee_name", ""),
                employment_number=emp_number,
                month=month_str,
                gross_salary=gross,
                nssf=calc["nssf"],
                shif=calc["shif"],
                paye=calc["paye"],
                nhdf=calc["ahl"],
                total_deductions=total_deductions,
                net_salary=net_salary,
                logo_bytes=logo_bytes,
                details=entry.get("details"),
                taxable_pay=calc["taxable_pay"],
                income_tax_before_relief=calc["income_tax_before_relief"],
                personal_relief=calc["personal_relief"],
                housing_levy=calc["ahl"],
            )

            # Upload PDF to R2
            from app.services.file_storage import _get_s3, R2_BUCKET
            import io as _io
            pdf_key = f"payslips/{org_id}/{month_str}/{user_id}.pdf"
            s3 = _get_s3()
            s3.put_object(
                Bucket=R2_BUCKET,
                Key=pdf_key,
                Body=pdf_bytes,
                ContentType="application/pdf",
            )

            doc_id = uuid.uuid4()
            doc = EmployeeDocument(
                id=doc_id,
                user_id=user_id,
                org_id=org_id,
                doc_type="payslip",
                title=f"Payslip - {month_str}",
                file_path=pdf_key,
                original_filename=f"payslip_{month_str}_{entry.get('employee_name','').replace(' ','_')}.pdf",
                mime_type="application/pdf",
                file_size=len(pdf_bytes),
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
                document_id=doc_id,
            )
            db.add(payslip)
            distributed_count += 1

        batch.status = "distributed"
        batch.distributed_at = _now_utc()
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Distribution failed: {e}")

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
