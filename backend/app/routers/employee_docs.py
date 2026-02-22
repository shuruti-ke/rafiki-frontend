# backend/app/routers/employee_docs.py
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.dependencies import get_current_org_id, get_current_user_id, get_current_role
from app.models.employee_document import EmployeeDocument, DocumentShare
from app.models.performance import PerformanceEvaluation, DisciplinaryRecord
from app.schemas.employee_docs import (
    EmployeeDocumentResponse,
    PerformanceEvaluationCreate, PerformanceEvaluationResponse, PerformanceEvaluationUpdate,
    DisciplinaryRecordCreate, DisciplinaryRecordResponse,
)
from app.services.file_storage import save_upload
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/employee-docs", tags=["Employee Documents"])


# Roles that can access other users' employee docs (Path B DB remains unchanged)
_PRIVILEGED_ROLES = {"hr_admin", "super_admin"}


def _can_access_user_docs(current_user_id: uuid.UUID, target_user_id: uuid.UUID, role: str) -> bool:
    """
    Path B, DB-as-is:
    - User can access their own docs.
    - HR Admin / Super Admin can access any user's docs.
    """
    if role in _PRIVILEGED_ROLES:
        return True
    return current_user_id == target_user_id


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


# --- Employee Documents ---

@router.post("/{user_id}/upload", response_model=EmployeeDocumentResponse)
def upload_employee_doc(
    user_id: uuid.UUID,
    file: UploadFile = File(...),
    doc_type: str = Query(default="other"),
    title: str = Query(...),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    # Prevent IDOR
    if not _can_access_user_docs(current_user_id, user_id, role):
        raise HTTPException(status_code=403, detail="Not authorized to upload for this user")

    file_path, original_name, size = save_upload(file, subfolder="employee_docs")

    # NOTE: Path B keeps DB as-is, so no "domain" column here.
    doc = EmployeeDocument(
        user_id=user_id,
        org_id=org_id,
        doc_type=doc_type,
        title=title,
        file_path=file_path,
        original_filename=original_name,
        mime_type=file.content_type or "application/octet-stream",
        file_size=size,
        uploaded_by=current_user_id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    log_action(
        db,
        org_id,
        current_user_id,
        "upload",
        "employee_document",
        doc.id,
        {"user_id": str(user_id), "title": title, "doc_type": doc_type},
    )
    return doc


@router.get("/{user_id}", response_model=list[EmployeeDocumentResponse])
def list_employee_docs(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    is_owner_or_privileged = _can_access_user_docs(current_user_id, user_id, role)

    # Docs shared to current user (active shares only)
    shared_doc_ids = (
        db.query(DocumentShare.document_id)
        .filter(
            DocumentShare.org_id == org_id,
            DocumentShare.granted_to == current_user_id,
            DocumentShare.revoked_at.is_(None),
        )
        .subquery()
    )

    q = db.query(EmployeeDocument).filter(EmployeeDocument.org_id == org_id)

    if role in _PRIVILEGED_ROLES:
        # HR/Super can see all docs for the target user, plus any docs shared to them (optional)
        q = q.filter(EmployeeDocument.user_id == user_id)
    elif is_owner_or_privileged:
        # Owner sees own docs OR docs shared to them
        q = q.filter(
            or_(
                EmployeeDocument.user_id == user_id,
                EmployeeDocument.id.in_(shared_doc_ids),
            )
        )
    else:
        # Non-owner/non-privileged can only see docs shared directly to them
        q = q.filter(EmployeeDocument.id.in_(shared_doc_ids))

    return q.order_by(EmployeeDocument.created_at.desc()).all()


@router.post("/{user_id}/{doc_id}/share")
def share_employee_doc(
    user_id: uuid.UUID,
    doc_id: uuid.UUID,
    target_user_id: uuid.UUID = Query(...),
    permission: str = Query(default="read"),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    # Owner can share, HR/Super can share
    if not _can_access_user_docs(current_user_id, user_id, role):
        raise HTTPException(status_code=403, detail="Not authorized to share for this user")

    doc = (
        db.query(EmployeeDocument)
        .filter(
            EmployeeDocument.id == doc_id,
            EmployeeDocument.org_id == org_id,
            EmployeeDocument.user_id == user_id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Create a new active share (DB already allows multiple rows; revoke uses latest active)
    share = DocumentShare(
        org_id=org_id,
        document_id=doc_id,
        granted_by=current_user_id,
        granted_to=target_user_id,
        permission=permission,
    )
    db.add(share)
    db.commit()
    db.refresh(share)

    log_action(
        db,
        org_id,
        current_user_id,
        "share",
        "employee_document",
        doc.id,
        {"user_id": str(user_id), "shared_to": str(target_user_id), "permission": permission},
    )
    return {"ok": True, "message": "Document shared"}


@router.post("/{user_id}/{doc_id}/revoke-share")
def revoke_employee_doc_share(
    user_id: uuid.UUID,
    doc_id: uuid.UUID,
    target_user_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    # Owner can revoke, HR/Super can revoke
    if not _can_access_user_docs(current_user_id, user_id, role):
        raise HTTPException(status_code=403, detail="Not authorized to revoke for this user")

    share = (
        db.query(DocumentShare)
        .filter(
            DocumentShare.org_id == org_id,
            DocumentShare.document_id == doc_id,
            DocumentShare.granted_to == target_user_id,
            DocumentShare.revoked_at.is_(None),
        )
        .order_by(DocumentShare.created_at.desc())
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Active share not found")

    share.revoked_at = _now_utc()
    db.commit()

    log_action(
        db,
        org_id,
        current_user_id,
        "revoke_share",
        "employee_document",
        doc_id,
        {"user_id": str(user_id), "revoked_from": str(target_user_id)},
    )
    return {"ok": True, "message": "Share revoked"}


@router.delete("/{user_id}/{doc_id}")
def delete_employee_doc(
    user_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    # Hard delete to match current DB behavior
    if not _can_access_user_docs(current_user_id, user_id, role):
        raise HTTPException(status_code=403, detail="Not authorized to delete for this user")

    doc = (
        db.query(EmployeeDocument)
        .filter(
            EmployeeDocument.id == doc_id,
            EmployeeDocument.user_id == user_id,
            EmployeeDocument.org_id == org_id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    db.delete(doc)
    db.commit()

    log_action(db, org_id, current_user_id, "delete", "employee_document", doc_id, {"user_id": str(user_id)})
    return {"ok": True, "message": "Document deleted"}


# --- Performance Evaluations ---

@router.post("/{user_id}/evaluations", response_model=PerformanceEvaluationResponse)
def create_evaluation(
    user_id: uuid.UUID,
    data: PerformanceEvaluationCreate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    if not _can_access_user_docs(current_user_id, user_id, role):
        raise HTTPException(status_code=403, detail="Not authorized to create evaluation for this user")

    if data.overall_rating < 1 or data.overall_rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    ev = PerformanceEvaluation(
        user_id=user_id,
        org_id=org_id,
        evaluation_period=data.evaluation_period,
        evaluator_id=current_user_id,
        overall_rating=data.overall_rating,
        strengths=data.strengths,
        areas_for_improvement=data.areas_for_improvement,
        goals_for_next_period=data.goals_for_next_period,
        comments=data.comments,
        objective_ids=data.objective_ids,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)

    log_action(
        db,
        org_id,
        current_user_id,
        "create",
        "evaluation",
        ev.id,
        {"user_id": str(user_id), "period": data.evaluation_period},
    )
    return ev


@router.get("/{user_id}/evaluations", response_model=list[PerformanceEvaluationResponse])
def list_evaluations(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    if not _can_access_user_docs(current_user_id, user_id, role):
        raise HTTPException(status_code=403, detail="Not authorized to view evaluations for this user")

    return (
        db.query(PerformanceEvaluation)
        .filter(PerformanceEvaluation.user_id == user_id, PerformanceEvaluation.org_id == org_id)
        .order_by(PerformanceEvaluation.created_at.desc())
        .all()
    )


@router.put("/{user_id}/evaluations/{eval_id}", response_model=PerformanceEvaluationResponse)
def update_evaluation(
    user_id: uuid.UUID,
    eval_id: uuid.UUID,
    update: PerformanceEvaluationUpdate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    if not _can_access_user_docs(current_user_id, user_id, role):
        raise HTTPException(status_code=403, detail="Not authorized to update evaluations for this user")

    ev = (
        db.query(PerformanceEvaluation)
        .filter(
            PerformanceEvaluation.id == eval_id,
            PerformanceEvaluation.user_id == user_id,
            PerformanceEvaluation.org_id == org_id,
        )
        .first()
    )
    if not ev:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    for field, value in update.model_dump(exclude_unset=True).items():
        if field == "overall_rating" and value is not None and (value < 1 or value > 5):
            raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
        setattr(ev, field, value)

    db.commit()
    db.refresh(ev)

    log_action(db, org_id, current_user_id, "update", "evaluation", ev.id, update.model_dump(exclude_unset=True))
    return ev


# --- Disciplinary Records ---

@router.post("/{user_id}/disciplinary", response_model=DisciplinaryRecordResponse)
def create_disciplinary(
    user_id: uuid.UUID,
    data: DisciplinaryRecordCreate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    # Highly sensitive: Path B keeps it strict.
    # HR/Super OR the user themselves (if you want HR-only, remove the self condition)
    if role not in _PRIVILEGED_ROLES and current_user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied to disciplinary records")

    record = DisciplinaryRecord(
        user_id=user_id,
        org_id=org_id,
        record_type=data.record_type,
        description=data.description,
        date_of_incident=data.date_of_incident,
        recorded_by=current_user_id,
        witnesses=data.witnesses,
        outcome=data.outcome,
        attachments=data.attachments,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    log_action(
        db,
        org_id,
        current_user_id,
        "create",
        "disciplinary_record",
        record.id,
        {"user_id": str(user_id), "type": data.record_type},
    )
    return record


@router.get("/{user_id}/disciplinary", response_model=list[DisciplinaryRecordResponse])
def list_disciplinary(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    # Highly sensitive: Path B keeps it strict.
    if role not in _PRIVILEGED_ROLES and current_user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied to disciplinary records")

    return (
        db.query(DisciplinaryRecord)
        .filter(DisciplinaryRecord.user_id == user_id, DisciplinaryRecord.org_id == org_id)
        .order_by(DisciplinaryRecord.created_at.desc())
        .all()
    )
