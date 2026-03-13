import uuid
import json
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_org_id, get_current_user_id, require_admin, require_manager

router = APIRouter(prefix="/api/v1/performance-360", tags=["Performance 360"])


class CycleCreateIn(BaseModel):
    name: str
    period_start: date
    period_end: date
    due_date: Optional[date] = None
    template: dict = {}


class ReviewRequestIn(BaseModel):
    employee_user_id: uuid.UUID
    reviewer_user_id: uuid.UUID
    reviewer_type: str  # self, manager, peer, subordinate, cross_functional


class ReviewSubmitIn(BaseModel):
    rating: float
    feedback_text: Optional[str] = None


@router.post("/cycles")
def create_cycle(
    body: CycleCreateIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_admin),
):
    row = db.execute(
        text(
            """INSERT INTO performance_cycles
               (id, org_id, name, period_start, period_end, due_date, template, status, created_by)
               VALUES (:id, :org, :name, :ps, :pe, :due, :template::jsonb, 'active', :created_by)
               RETURNING *"""
        ),
        {
            "id": str(uuid.uuid4()),
            "org": str(org_id),
            "name": body.name.strip(),
            "ps": body.period_start,
            "pe": body.period_end,
            "due": body.due_date,
            "template": json.dumps(body.template or {}),
            "created_by": str(user_id),
        },
    ).mappings().first()
    db.commit()
    return {"cycle": dict(row)}


@router.get("/cycles")
def list_cycles(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    rows = db.execute(
        text("SELECT * FROM performance_cycles WHERE org_id=:org ORDER BY created_at DESC"),
        {"org": str(org_id)},
    ).mappings().all()
    return {"cycles": [dict(r) for r in rows]}


@router.post("/cycles/{cycle_id}/requests")
def create_review_requests(
    cycle_id: uuid.UUID,
    requests: list[ReviewRequestIn],
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    cycle = db.execute(
        text("SELECT id FROM performance_cycles WHERE id=:id AND org_id=:org"),
        {"id": str(cycle_id), "org": str(org_id)},
    ).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")

    created = 0
    for req in requests:
        exists = db.execute(
            text(
                """SELECT id FROM performance_reviews_360
                   WHERE org_id=:org AND cycle_id=:cycle AND employee_user_id=:emp
                     AND reviewer_user_id=:reviewer"""
            ),
            {"org": str(org_id), "cycle": str(cycle_id), "emp": str(req.employee_user_id), "reviewer": str(req.reviewer_user_id)},
        ).first()
        if exists:
            continue
        db.execute(
            text(
                """INSERT INTO performance_reviews_360
                   (id, org_id, cycle_id, employee_user_id, reviewer_user_id, reviewer_type, status)
                   VALUES (:id, :org, :cycle, :emp, :reviewer, :rtype, 'pending')"""
            ),
            {
                "id": str(uuid.uuid4()),
                "org": str(org_id),
                "cycle": str(cycle_id),
                "emp": str(req.employee_user_id),
                "reviewer": str(req.reviewer_user_id),
                "rtype": req.reviewer_type,
            },
        )
        created += 1
    db.commit()
    return {"created_requests": created}


@router.get("/my-reviews")
def my_pending_reviews(
    cycle_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    q = """
        SELECT pr.*, u.name AS employee_name, c.name AS cycle_name
        FROM performance_reviews_360 pr
        JOIN users_legacy u ON u.user_id = pr.employee_user_id
        JOIN performance_cycles c ON c.id = pr.cycle_id
        WHERE pr.org_id=:org AND pr.reviewer_user_id=:uid
    """
    params = {"org": str(org_id), "uid": str(user_id)}
    if cycle_id:
        q += " AND pr.cycle_id=:cycle"
        params["cycle"] = str(cycle_id)
    q += " ORDER BY pr.created_at DESC"
    rows = db.execute(text(q), params).mappings().all()
    return {"reviews": [dict(r) for r in rows]}


@router.post("/reviews/{review_id}/submit")
def submit_review(
    review_id: uuid.UUID,
    body: ReviewSubmitIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    row = db.execute(
        text(
            """SELECT * FROM performance_reviews_360
               WHERE id=:id AND org_id=:org AND reviewer_user_id=:uid"""
        ),
        {"id": str(review_id), "org": str(org_id), "uid": str(user_id)},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Review not found")

    db.execute(
        text(
            """UPDATE performance_reviews_360
               SET rating=:rating, feedback_text=:feedback, status='submitted',
                   submitted_at=:submitted_at, updated_at=:updated_at
               WHERE id=:id"""
        ),
        {
            "rating": body.rating,
            "feedback": body.feedback_text,
            "submitted_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "id": str(review_id),
        },
    )
    db.commit()
    return {"ok": True}


@router.get("/cycles/{cycle_id}/employee/{employee_user_id}/summary")
def employee_cycle_summary(
    cycle_id: uuid.UUID,
    employee_user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    rows = db.execute(
        text(
            """SELECT reviewer_type, rating, feedback_text, status, submitted_at
               FROM performance_reviews_360
               WHERE org_id=:org AND cycle_id=:cycle AND employee_user_id=:emp
               ORDER BY submitted_at DESC NULLS LAST"""
        ),
        {"org": str(org_id), "cycle": str(cycle_id), "emp": str(employee_user_id)},
    ).mappings().all()
    submitted = [r for r in rows if r["status"] == "submitted" and r["rating"] is not None]
    avg_rating = round(sum(float(r["rating"]) for r in submitted) / len(submitted), 2) if submitted else None
    by_type = {}
    for r in submitted:
        by_type.setdefault(r["reviewer_type"], []).append(float(r["rating"]))
    by_type = {k: round(sum(v) / len(v), 2) for k, v in by_type.items()}
    return {
        "cycle_id": str(cycle_id),
        "employee_user_id": str(employee_user_id),
        "average_rating": avg_rating,
        "ratings_by_reviewer_type": by_type,
        "reviews": [dict(r) for r in rows],
    }
