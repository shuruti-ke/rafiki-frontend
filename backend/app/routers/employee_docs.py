from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.employee_document import EmployeeDocument
from app.models.performance import PerformanceEvaluation, DisciplinaryRecord
from app.schemas.employee_docs import (
    EmployeeDocumentResponse,
    PerformanceEvaluationCreate, PerformanceEvaluationResponse, PerformanceEvaluationUpdate,
    DisciplinaryRecordCreate, DisciplinaryRecordResponse,
)
from app.services.file_storage import save_upload
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/employee-docs", tags=["Employee Documents"])

DEMO_ORG_ID = 1
DEMO_USER_ID = 1


# --- Employee Documents ---

@router.post("/{user_id}/upload", response_model=EmployeeDocumentResponse)
async def upload_employee_doc(
    user_id: int,
    file: UploadFile = File(...),
    doc_type: str = Query(default="other"),
    title: str = Query(...),
    db: Session = Depends(get_db),
):
    file_path, original_name, size = await save_upload(file, subfolder="employee_docs")

    doc = EmployeeDocument(
        user_id=user_id,
        org_id=DEMO_ORG_ID,
        doc_type=doc_type,
        title=title,
        file_path=file_path,
        original_filename=original_name,
        mime_type=file.content_type or "application/octet-stream",
        file_size=size,
        uploaded_by=DEMO_USER_ID,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "upload", "employee_document", doc.id, {"user_id": user_id, "title": title})
    return doc


@router.get("/{user_id}", response_model=list[EmployeeDocumentResponse])
def list_employee_docs(user_id: int, db: Session = Depends(get_db)):
    return (
        db.query(EmployeeDocument)
        .filter(EmployeeDocument.user_id == user_id, EmployeeDocument.org_id == DEMO_ORG_ID)
        .order_by(EmployeeDocument.created_at.desc())
        .all()
    )


@router.delete("/{user_id}/{doc_id}")
def delete_employee_doc(user_id: int, doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(EmployeeDocument).filter(
        EmployeeDocument.id == doc_id,
        EmployeeDocument.user_id == user_id,
        EmployeeDocument.org_id == DEMO_ORG_ID,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    db.delete(doc)
    db.commit()

    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "delete", "employee_document", doc_id, {"user_id": user_id})
    return {"ok": True, "message": "Document deleted"}


# --- Performance Evaluations ---

@router.post("/{user_id}/evaluations", response_model=PerformanceEvaluationResponse)
def create_evaluation(user_id: int, data: PerformanceEvaluationCreate, db: Session = Depends(get_db)):
    if data.overall_rating < 1 or data.overall_rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    ev = PerformanceEvaluation(
        user_id=user_id,
        org_id=DEMO_ORG_ID,
        evaluation_period=data.evaluation_period,
        evaluator_id=data.evaluator_id,
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

    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "create", "evaluation", ev.id, {"user_id": user_id, "period": data.evaluation_period})
    return ev


@router.get("/{user_id}/evaluations", response_model=list[PerformanceEvaluationResponse])
def list_evaluations(user_id: int, db: Session = Depends(get_db)):
    return (
        db.query(PerformanceEvaluation)
        .filter(PerformanceEvaluation.user_id == user_id, PerformanceEvaluation.org_id == DEMO_ORG_ID)
        .order_by(PerformanceEvaluation.created_at.desc())
        .all()
    )


@router.put("/{user_id}/evaluations/{eval_id}", response_model=PerformanceEvaluationResponse)
def update_evaluation(user_id: int, eval_id: int, update: PerformanceEvaluationUpdate, db: Session = Depends(get_db)):
    ev = db.query(PerformanceEvaluation).filter(
        PerformanceEvaluation.id == eval_id,
        PerformanceEvaluation.user_id == user_id,
        PerformanceEvaluation.org_id == DEMO_ORG_ID,
    ).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    for field, value in update.model_dump(exclude_unset=True).items():
        if field == "overall_rating" and value is not None and (value < 1 or value > 5):
            raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
        setattr(ev, field, value)

    db.commit()
    db.refresh(ev)

    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "update", "evaluation", ev.id, update.model_dump(exclude_unset=True))
    return ev


# --- Disciplinary Records ---

@router.post("/{user_id}/disciplinary", response_model=DisciplinaryRecordResponse)
def create_disciplinary(user_id: int, data: DisciplinaryRecordCreate, db: Session = Depends(get_db)):
    record = DisciplinaryRecord(
        user_id=user_id,
        org_id=DEMO_ORG_ID,
        record_type=data.record_type,
        description=data.description,
        date_of_incident=data.date_of_incident,
        recorded_by=DEMO_USER_ID,
        witnesses=data.witnesses,
        outcome=data.outcome,
        attachments=data.attachments,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "create", "disciplinary_record", record.id, {"user_id": user_id, "type": data.record_type})
    return record


@router.get("/{user_id}/disciplinary", response_model=list[DisciplinaryRecordResponse])
def list_disciplinary(user_id: int, db: Session = Depends(get_db)):
    return (
        db.query(DisciplinaryRecord)
        .filter(DisciplinaryRecord.user_id == user_id, DisciplinaryRecord.org_id == DEMO_ORG_ID)
        .order_by(DisciplinaryRecord.created_at.desc())
        .all()
    )
