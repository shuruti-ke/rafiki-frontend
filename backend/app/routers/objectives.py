"""Objectives (OKR) router."""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id, require_manager
from app.models.objective import Objective, KeyResult
from app.schemas.objectives import (
    ObjectiveCreate, ObjectiveUpdate, ObjectiveResponse,
    KeyResultCreate, KeyResultUpdate, KeyResultResponse,
    ReviewRequest,
)

router = APIRouter(prefix="/api/v1/objectives", tags=["Objectives"])


def _recompute_progress(db: Session, objective: Objective):
    """Recompute objective progress from key results."""
    krs = db.query(KeyResult).filter(KeyResult.objective_id == objective.id).all()
    if not krs:
        objective.progress = 0
    else:
        total = sum(
            min(max((kr.current_value / kr.target_value * 100) if kr.target_value else 0, 0), 100)
            for kr in krs
        )
        objective.progress = int(total / len(krs))
    db.add(objective)
    db.commit()
    db.refresh(objective)


# ── CRUD ──

@router.post("/", response_model=ObjectiveResponse)
def create_objective(
    body: ObjectiveCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    obj = Objective(
        org_id=org_id,
        user_id=user_id,
        title=body.title,
        description=body.description,
        target_date=body.target_date,
        status="draft",
    )
    db.add(obj)
    db.flush()

    for kr_data in body.key_results:
        kr = KeyResult(
            objective_id=obj.id,
            title=kr_data.title,
            target_value=kr_data.target_value,
            current_value=kr_data.current_value,
            unit=kr_data.unit,
        )
        db.add(kr)

    db.commit()
    db.refresh(obj)
    _recompute_progress(db, obj)
    return obj


@router.get("/", response_model=list[ObjectiveResponse])
def list_objectives(
    status: Optional[str] = Query(None),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    q = db.query(Objective).filter(Objective.user_id == user_id)
    if status:
        q = q.filter(Objective.status == status)
    return q.order_by(Objective.created_at.desc()).all()


@router.get("/{objective_id}", response_model=ObjectiveResponse)
def get_objective(
    objective_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    obj = db.query(Objective).filter(Objective.id == objective_id).first()
    if not obj:
        raise HTTPException(404, "Objective not found")
    return obj


@router.put("/{objective_id}", response_model=ObjectiveResponse)
def update_objective(
    objective_id: uuid.UUID,
    body: ObjectiveUpdate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    obj = db.query(Objective).filter(Objective.id == objective_id, Objective.user_id == user_id).first()
    if not obj:
        raise HTTPException(404, "Objective not found or not owned by you")
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(obj, field, val)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{objective_id}")
def delete_objective(
    objective_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    obj = db.query(Objective).filter(Objective.id == objective_id, Objective.user_id == user_id).first()
    if not obj:
        raise HTTPException(404, "Objective not found or not owned by you")
    if obj.status not in ("draft", "cancelled"):
        raise HTTPException(400, "Can only delete draft or cancelled objectives")
    db.delete(obj)
    db.commit()
    return {"ok": True}


# ── Key Results ──

@router.post("/{objective_id}/key-results", response_model=KeyResultResponse)
def add_key_result(
    objective_id: uuid.UUID,
    body: KeyResultCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    obj = db.query(Objective).filter(Objective.id == objective_id, Objective.user_id == user_id).first()
    if not obj:
        raise HTTPException(404, "Objective not found or not owned by you")
    kr = KeyResult(
        objective_id=objective_id,
        title=body.title,
        target_value=body.target_value,
        current_value=body.current_value,
        unit=body.unit,
    )
    db.add(kr)
    db.commit()
    db.refresh(kr)
    _recompute_progress(db, obj)
    return kr


@router.put("/{objective_id}/key-results/{kr_id}", response_model=KeyResultResponse)
def update_key_result(
    objective_id: uuid.UUID,
    kr_id: uuid.UUID,
    body: KeyResultUpdate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    obj = db.query(Objective).filter(Objective.id == objective_id, Objective.user_id == user_id).first()
    if not obj:
        raise HTTPException(404, "Objective not found or not owned by you")
    kr = db.query(KeyResult).filter(KeyResult.id == kr_id, KeyResult.objective_id == objective_id).first()
    if not kr:
        raise HTTPException(404, "Key result not found")
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(kr, field, val)
    db.commit()
    db.refresh(kr)
    _recompute_progress(db, obj)
    return kr


@router.delete("/{objective_id}/key-results/{kr_id}")
def delete_key_result(
    objective_id: uuid.UUID,
    kr_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    obj = db.query(Objective).filter(Objective.id == objective_id, Objective.user_id == user_id).first()
    if not obj:
        raise HTTPException(404, "Objective not found or not owned by you")
    kr = db.query(KeyResult).filter(KeyResult.id == kr_id, KeyResult.objective_id == objective_id).first()
    if not kr:
        raise HTTPException(404, "Key result not found")
    db.delete(kr)
    db.commit()
    _recompute_progress(db, obj)
    return {"ok": True}


# ── Review Flow ──

@router.post("/{objective_id}/submit-review", response_model=ObjectiveResponse)
def submit_for_review(
    objective_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    obj = db.query(Objective).filter(Objective.id == objective_id, Objective.user_id == user_id).first()
    if not obj:
        raise HTTPException(404, "Objective not found or not owned by you")
    obj.status = "pending_review"
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/team/pending-reviews", response_model=list[ObjectiveResponse])
def list_pending_reviews(
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
    db: Session = Depends(get_db),
):
    return (
        db.query(Objective)
        .filter(Objective.org_id == org_id, Objective.status == "pending_review")
        .order_by(Objective.updated_at.desc())
        .all()
    )


@router.post("/{objective_id}/review", response_model=ObjectiveResponse)
def review_objective(
    objective_id: uuid.UUID,
    body: ReviewRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
    db: Session = Depends(get_db),
):
    obj = db.query(Objective).filter(Objective.id == objective_id, Objective.org_id == org_id).first()
    if not obj:
        raise HTTPException(404, "Objective not found in your org")
    if obj.status != "pending_review":
        raise HTTPException(400, "Objective is not pending review")

    obj.reviewed_by = user_id
    obj.review_status = body.review_status
    obj.review_notes = body.review_notes
    obj.reviewed_at = datetime.now(timezone.utc)

    if body.review_status == "approved":
        obj.status = "active"
    elif body.review_status == "needs_revision":
        obj.status = "draft"

    db.commit()
    db.refresh(obj)
    return obj
