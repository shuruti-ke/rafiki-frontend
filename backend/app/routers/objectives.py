"""Objectives (OKR) router."""

import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id, require_manager
from app.models.objective import Objective, KeyResult, ObjectiveComment
from app.models.user import User
from app.models.message import DmConversation, DmMessage, ConversationParticipant
from app.schemas.objectives import (
    ObjectiveCreate, ObjectiveUpdate, ObjectiveResponse,
    KeyResultCreate, KeyResultUpdate, KeyResultResponse,
    SubmitForReviewRequest, ReviewRequest, CommentCreate, CommentResponse,
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


def _get_or_create_direct_conversation(
    db: Session,
    *,
    org_id: uuid.UUID,
    a_user_id: uuid.UUID,
    b_user_id: uuid.UUID,
) -> DmConversation:
    """Return existing 1:1 conversation between a and b, or create one."""
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


def _send_objective_review_dm(
    db: Session,
    *,
    org_id: uuid.UUID,
    sender_id: uuid.UUID,
    reviewer_id: uuid.UUID,
    objective: Objective,
    submitter_name: str,
):
    """Send a DM with embedded objective review block."""
    krs = db.query(KeyResult).filter(KeyResult.objective_id == objective.id).all()
    kr_summary = "; ".join(
        f"{kr.title} ({kr.current_value}/{kr.target_value} {kr.unit})" for kr in krs
    ) if krs else "None"

    payload = {
        "kind": "objective_review_request",
        "objective_id": str(objective.id),
        "title": objective.title,
        "description": objective.description or "",
        "progress": objective.progress,
        "target_date": str(objective.target_date) if objective.target_date else None,
        "key_results_summary": kr_summary,
        "submitter_name": submitter_name,
        "approve_endpoint": f"/api/v1/objectives/{objective.id}/review",
        "reject_endpoint": f"/api/v1/objectives/{objective.id}/review",
    }

    dm_text = (
        f"📋 Objective review requested\n"
        f"Title: {objective.title}\n"
        f"Submitted by: {submitter_name}\n"
        f"Progress: {objective.progress}%\n"
        f"Key Results: {kr_summary}\n\n"
        f"[[OBJECTIVE_REVIEW]]{json.dumps(payload)}[[/OBJECTIVE_REVIEW]]"
    )

    convo = _get_or_create_direct_conversation(
        db, org_id=org_id, a_user_id=sender_id, b_user_id=reviewer_id,
    )
    db.add(DmMessage(conversation_id=convo.id, sender_id=sender_id, content=dm_text))


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


@router.get("/reviewers")
def list_reviewers(
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Return managers / hr_admins / super_admins in the same org, excluding current user."""
    reviewers = (
        db.query(User)
        .filter(
            User.org_id == org_id,
            User.user_id != user_id,
            User.role.in_(["manager", "hr_admin", "super_admin"]),
            User.is_active == True,  # noqa: E712
        )
        .order_by(User.name)
        .all()
    )
    return {
        "reviewers": [
            {
                "user_id": str(u.user_id),
                "name": u.name or u.email or u.anonymous_alias,
                "email": u.email,
                "role": u.role,
            }
            for u in reviewers
        ]
    }


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
    body: SubmitForReviewRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    obj = db.query(Objective).filter(Objective.id == objective_id, Objective.user_id == user_id).first()
    if not obj:
        raise HTTPException(404, "Objective not found or not owned by you")

    # Validate reviewer exists in org with appropriate role
    reviewer = (
        db.query(User)
        .filter(
            User.user_id == body.reviewer_id,
            User.org_id == org_id,
            User.role.in_(["manager", "hr_admin", "super_admin"]),
        )
        .first()
    )
    if not reviewer:
        raise HTTPException(400, "Selected reviewer not found or does not have a reviewer role")

    obj.status = "pending_review"
    obj.reviewed_by = body.reviewer_id

    # Get submitter name for the DM
    submitter = db.query(User).filter(User.user_id == user_id).first()
    submitter_name = (submitter.name or submitter.email or "Unknown") if submitter else "Unknown"

    _send_objective_review_dm(
        db,
        org_id=org_id,
        sender_id=user_id,
        reviewer_id=body.reviewer_id,
        objective=obj,
        submitter_name=submitter_name,
    )

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


# ── Comments ──

@router.get("/{objective_id}/comments", response_model=list[CommentResponse])
def list_comments(
    objective_id: uuid.UUID,
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    obj = db.query(Objective).filter(Objective.id == objective_id, Objective.org_id == org_id).first()
    if not obj:
        raise HTTPException(404, "Objective not found in your org")
    rows = (
        db.query(ObjectiveComment, User.name)
        .outerjoin(User, ObjectiveComment.user_id == User.user_id)
        .filter(ObjectiveComment.objective_id == objective_id)
        .order_by(ObjectiveComment.created_at.asc())
        .all()
    )
    return [
        CommentResponse(
            id=c.id,
            objective_id=c.objective_id,
            user_id=c.user_id,
            user_name=name or "Unknown",
            content=c.content,
            created_at=c.created_at,
        )
        for c, name in rows
    ]


@router.post("/{objective_id}/comments", response_model=CommentResponse)
def add_comment(
    objective_id: uuid.UUID,
    body: CommentCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    obj = db.query(Objective).filter(Objective.id == objective_id, Objective.org_id == org_id).first()
    if not obj:
        raise HTTPException(404, "Objective not found in your org")
    comment = ObjectiveComment(
        objective_id=objective_id,
        user_id=user_id,
        content=body.content.strip(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    user = db.query(User).filter(User.user_id == user_id).first()
    return CommentResponse(
        id=comment.id,
        objective_id=comment.objective_id,
        user_id=comment.user_id,
        user_name=user.name if user else "Unknown",
        content=comment.content,
        created_at=comment.created_at,
    )
