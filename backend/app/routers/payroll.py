import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_org_id, get_current_user_id, require_admin
from app.models.payroll import PayrollTemplate, PayrollBatch, Payslip
from app.models.employee_document import EmployeeDocument
from app.schemas.payroll import (
    PayrollTemplateResponse,
    PayrollBatchResponse,
    PayslipResponse,
)
from app.services.file_storage import save_upload, get_download_url, delete_file
from app.services.audit import log_action
from app.services.payroll_parser import parse_payroll_file

router = APIRouter(prefix="/api/v1/payroll", tags=["Payroll"])

PAYROLL_MIME_TYPES = {
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # xlsx
    "application/vnd.ms-excel",  # xls (sometimes also xlsx depending on client)
    "application/pdf",  # pdf
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # docx
}


# ── Payroll Templates ──

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


# ── Payroll Batches (uploads) ──

@router.post("/upload", response_model=PayrollBatchResponse)
def upload_payroll(
    file: UploadFile = File(...),
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    template_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_admin),
):
    content_type = file.content_type or ""
    if content_type not in PAYROLL_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"File type not allowed: {content_type}. Use CSV, Excel, PDF, or DOCX.")

    # Verify template exists
    tmpl = db.query(PayrollTemplate).filter(
        PayrollTemplate.template_id == template_id, PayrollTemplate.org_id == org_id
    ).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")

    file_path, original_name, size = save_upload(file, subfolder="payroll_uploads")

    # Parse month string "YYYY-MM" into year and month ints
    year, mo = int(month[:4]), int(month[5:])

    batch = PayrollBatch(
        org_id=org_id,
        period_year=year,
        period_month=mo,
        template_id=template_id,
        upload_storage_key=file_path,
        upload_mime_type=content_type,
        created_by_user_id=current_user_id,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    log_action(db, org_id, current_user_id, "upload", "payroll_batch", batch.batch_id, {"month": month})
    return batch


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

    # Download file content from R2
    from app.services.file_storage import _get_s3, R2_BUCKET
    try:
        s3 = _get_s3()
        obj = s3.get_object(Bucket=R2_BUCKET, Key=batch.upload_storage_key)
        content = obj["Body"].read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read payroll file: {e}")

    # Parse using filename extension (csv/xls/xlsx/pdf/docx)
    filename = (
        getattr(batch, "upload_original_filename", None)
        or getattr(batch, "original_filename", None)
        or batch.upload_storage_key
    )
    result = parse_payroll_file(filename, content, db, org_id)

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    # Store totals on the batch record
    batch.payroll_total = result["total_gross"]
    batch.computed_total = result["total_net"]
    batch.discrepancy = round(
        (result["total_gross"] - result["total_deductions"]) - result["total_net"], 2
    )
    batch.status = "parsed"
    db.commit()
    db.refresh(batch)

    month_str = f"{batch.period_year}-{batch.period_month:02d}"
    log_action(db, org_id, current_user_id, "parse", "payroll_batch", batch.batch_id, {
        "employee_count": result["employee_count"],
        "matched": result["matched_count"],
        "unmatched": len(result["unmatched_names"]),
    })

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
    if batch.status == "uploaded":
        raise HTTPException(status_code=400, detail="Payroll not yet parsed. Call /parse first.")

    # Re-download and re-parse to get entries for verification display
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
    if batch.status == "uploaded":
        raise HTTPException(status_code=400, detail="Payroll not yet parsed")
    if batch.status == "distributed":
        raise HTTPException(status_code=400, detail="Already distributed")

    # Re-parse to get entries with matched users
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

        # Create employee document (payslip) in their vault
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

        # Create payslip record
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
    batch.distributed_at = datetime.now(timezone.utc)
    db.commit()

    log_action(db, org_id, current_user_id, "distribute", "payroll_batch", batch.batch_id, {
        "month": month_str,
        "distributed_count": distributed_count,
    })

    return {
        "ok": True,
        "message": f"Distributed {distributed_count} payslips",
        "distributed_count": distributed_count,
    }


# ── Employee Payslip Views ──

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

    # Get the linked employee document for download
    if payslip.document_id:
        doc = db.query(EmployeeDocument).filter(EmployeeDocument.id == payslip.document_id).first()
        if doc:
            url = get_download_url(doc.file_path)
            return {"url": url}

    raise HTTPException(status_code=404, detail="Payslip document not found")
