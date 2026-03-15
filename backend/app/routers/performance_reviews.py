import uuid
import json
from datetime import datetime, date, timedelta
from typing import Optional, Any

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_org_id, get_current_user_id, require_admin, require_manager

router = APIRouter(prefix="/api/v1/performance-360", tags=["Performance 360"])

# Template structure: { "criteria": [ {"id": "c1", "label": "Quality of work", "weight": 1 }, ... ],
#                      "rating_scale": { "min": 1, "max": 5, "labels": ["Needs improvement", ..., "Exceptional"] },
#                      "period_type": "quarterly" | "bi_annual" | "annual" (optional, for display) }


class CycleCreateIn(BaseModel):
    name: str
    period_start: date
    period_end: date
    due_date: Optional[date] = None
    template: dict = {}  # criteria, rating_scale, period_type


class CycleUpdateIn(BaseModel):
    name: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    due_date: Optional[date] = None
    template: Optional[dict] = None
    status: Optional[str] = None  # draft | active | closed


class ReviewRequestIn(BaseModel):
    employee_user_id: uuid.UUID
    reviewer_user_id: uuid.UUID
    reviewer_type: str  # self, manager, peer, subordinate, cross_functional


class ReviewSubmitIn(BaseModel):
    rating: float
    feedback_text: Optional[str] = None
    criteria_ratings: Optional[dict[str, float]] = None  # criterion id -> score (for template-based reviews)


@router.post("/cycles")
def create_cycle(
    body: CycleCreateIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_admin),
):
    """Create a review cycle (draft). Use PATCH to set template, then POST /launch to activate."""
    row = db.execute(
        text(
            """INSERT INTO performance_cycles
               (id, org_id, name, period_start, period_end, due_date, template, status, created_by)
               VALUES (:id, :org, :name, :ps, :pe, :due, :template::jsonb, 'draft', :created_by)
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


@router.get("/cycles/{cycle_id}")
def get_cycle(
    cycle_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    row = db.execute(
        text("SELECT * FROM performance_cycles WHERE id=:id AND org_id=:org"),
        {"id": str(cycle_id), "org": str(org_id)},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Cycle not found")
    return {"cycle": dict(row)}


@router.patch("/cycles/{cycle_id}")
def update_cycle(
    cycle_id: uuid.UUID,
    body: CycleUpdateIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    updates = []
    params: dict[str, Any] = {"id": str(cycle_id), "org": str(org_id)}
    if body.name is not None:
        updates.append("name = :name")
        params["name"] = body.name.strip()
    if body.period_start is not None:
        updates.append("period_start = :ps")
        params["ps"] = body.period_start
    if body.period_end is not None:
        updates.append("period_end = :pe")
        params["pe"] = body.period_end
    if body.due_date is not None:
        updates.append("due_date = :due")
        params["due"] = body.due_date
    if body.template is not None:
        updates.append("template = :template::jsonb")
        params["template"] = json.dumps(body.template)
    if body.status is not None and body.status in ("draft", "active", "closed"):
        updates.append("status = :status")
        params["status"] = body.status
    if not updates:
        row = db.execute(
            text("SELECT * FROM performance_cycles WHERE id=:id AND org_id=:org"),
            params,
        ).mappings().first()
        return {"cycle": dict(row)} if row else __cycle_404()
    params["updated_at"] = datetime.utcnow()
    db.execute(
        text(
            f"""UPDATE performance_cycles SET {", ".join(updates)}, updated_at = :updated_at
                WHERE id=:id AND org_id=:org"""
        ),
        params,
    )
    db.commit()
    row = db.execute(
        text("SELECT * FROM performance_cycles WHERE id=:id AND org_id=:org"),
        {"id": str(cycle_id), "org": str(org_id)},
    ).mappings().first()
    return {"cycle": dict(row)} if row else __cycle_404()


def __cycle_404():
    raise HTTPException(status_code=404, detail="Cycle not found")


@router.post("/cycles/{cycle_id}/launch")
def launch_cycle(
    cycle_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """Activate cycle and create self-review + manager-review for every org member. Optional 360 peers can be added via Add Request."""
    cycle = db.execute(
        text("SELECT id, status FROM performance_cycles WHERE id=:id AND org_id=:org"),
        {"id": str(cycle_id), "org": str(org_id)},
    ).mappings().first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
    if cycle["status"] != "draft":
        raise HTTPException(status_code=400, detail="Cycle already launched or closed")

    users = db.execute(
        text("SELECT user_id, manager_id FROM users_legacy WHERE org_id=:org AND is_active = true"),
        {"org": str(org_id)},
    ).mappings().all()

    created = 0
    for u in users:
        uid = str(u["user_id"])
        # Self-review
        exists_self = db.execute(
            text(
                """SELECT id FROM performance_reviews_360
                   WHERE org_id=:org AND cycle_id=:cycle AND employee_user_id=:emp AND reviewer_user_id=:emp AND reviewer_type='self'"""
            ),
            {"org": str(org_id), "cycle": str(cycle_id), "emp": uid},
        ).first()
        if not exists_self:
            db.execute(
                text(
                    """INSERT INTO performance_reviews_360
                       (id, org_id, cycle_id, employee_user_id, reviewer_user_id, reviewer_type, status)
                       VALUES (:id, :org, :cycle, :emp, :emp, 'self', 'pending')"""
                ),
                {"id": str(uuid.uuid4()), "org": str(org_id), "cycle": str(cycle_id), "emp": uid},
            )
            created += 1
        # Manager review (if employee has a manager)
        manager_id = u.get("manager_id")
        if manager_id:
            mid = str(manager_id)
            exists_mgr = db.execute(
                text(
                    """SELECT id FROM performance_reviews_360
                       WHERE org_id=:org AND cycle_id=:cycle AND employee_user_id=:emp AND reviewer_user_id=:reviewer AND reviewer_type='manager'"""
                ),
                {"org": str(org_id), "cycle": str(cycle_id), "emp": uid, "reviewer": mid},
            ).first()
            if not exists_mgr:
                db.execute(
                    text(
                        """INSERT INTO performance_reviews_360
                           (id, org_id, cycle_id, employee_user_id, reviewer_user_id, reviewer_type, status)
                           VALUES (:id, :org, :cycle, :emp, :reviewer, 'manager', 'pending')"""
                    ),
                    {"id": str(uuid.uuid4()), "org": str(org_id), "cycle": str(cycle_id), "emp": uid, "reviewer": mid},
                )
                created += 1

    db.execute(
        text("UPDATE performance_cycles SET status = 'active', updated_at = :now WHERE id=:id AND org_id=:org"),
        {"now": datetime.utcnow(), "id": str(cycle_id), "org": str(org_id)},
    )
    db.commit()
    return {"ok": True, "cycle_id": str(cycle_id), "created_requests": created}


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
    requests: list[ReviewRequestIn] = Body(...),
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
    """List reviews where current user is the reviewer. Includes cycle template and due_date for the review form."""
    q = """
        SELECT pr.*, u.name AS employee_name, c.name AS cycle_name, c.due_date AS cycle_due_date, c.template AS cycle_template
        FROM performance_reviews_360 pr
        JOIN users_legacy u ON u.user_id = pr.employee_user_id
        JOIN performance_cycles c ON c.id = pr.cycle_id
        WHERE pr.org_id=:org AND pr.reviewer_user_id=:uid
    """
    params = {"org": str(org_id), "uid": str(user_id)}
    if cycle_id:
        q += " AND pr.cycle_id=:cycle"
        params["cycle"] = str(cycle_id)
    q += " ORDER BY c.due_date ASC NULLS LAST, pr.created_at DESC"
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
    if row["status"] == "submitted":
        raise HTTPException(status_code=400, detail="Review already submitted")

    criteria_json = json.dumps(body.criteria_ratings) if body.criteria_ratings else None
    db.execute(
        text(
            """UPDATE performance_reviews_360
               SET rating=:rating, feedback_text=:feedback, criteria_ratings=:criteria_ratings::jsonb,
                   status='submitted', submitted_at=:submitted_at, updated_at=:updated_at
               WHERE id=:id"""
        ),
        {
            "rating": body.rating,
            "feedback": body.feedback_text,
            "criteria_ratings": criteria_json,
            "submitted_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "id": str(review_id),
        },
    )
    db.commit()
    return {"ok": True}


@router.get("/reminders")
def review_reminders(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Cycles with due date in the next 14 days where the current user has pending reviews (for deadline tracking)."""
    today = date.today()
    window_end = today + timedelta(days=14)
    rows = db.execute(
        text("""
            SELECT c.id AS cycle_id, c.name AS cycle_name, c.due_date,
                   COUNT(pr.id) AS pending_count
            FROM performance_cycles c
            JOIN performance_reviews_360 pr ON pr.cycle_id = c.id AND pr.org_id = c.org_id
            WHERE c.org_id = :org AND c.status = 'active'
              AND c.due_date IS NOT NULL AND c.due_date >= :today AND c.due_date <= :window_end
              AND pr.reviewer_user_id = :uid AND pr.status = 'pending'
            GROUP BY c.id, c.name, c.due_date
            ORDER BY c.due_date ASC
        """),
        {"org": str(org_id), "uid": str(user_id), "today": today, "window_end": window_end},
    ).mappings().all()
    return {"reminders": [dict(r) for r in rows]}


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
            """SELECT reviewer_type, rating, feedback_text, criteria_ratings, status, submitted_at
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
