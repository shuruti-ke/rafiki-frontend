import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_org_id, get_current_user_id, require_admin, require_manager
from app.models.calendar_event import CalendarEvent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/shifts", tags=["Shift Management"])


def _parse_time(hhmm: str):
    """Parse 'HH:MM' to (hour, minute). Returns (0, 0) on failure."""
    try:
        parts = hhmm.strip().split(":")
        return int(parts[0]) % 24, int(parts[1]) % 60
    except (IndexError, ValueError):
        return 0, 0


def _sync_shift_to_calendar(
    db: Session,
    org_id: uuid.UUID,
    assignment_id: str,
    user_id: uuid.UUID,
    shift_date: date,
    template_name: str,
    start_time: str,
    end_time: str,
    crosses_midnight: bool,
) -> None:
    """Create or update one calendar event for this shift assignment (main calendar sync)."""
    db.query(CalendarEvent).filter(
        CalendarEvent.org_id == org_id,
        CalendarEvent.source == "shift",
        CalendarEvent.external_id == f"shift_{assignment_id}",
    ).delete(synchronize_session=False)
    sh, sm = _parse_time(start_time)
    eh, em = _parse_time(end_time)
    start_dt = datetime(shift_date.year, shift_date.month, shift_date.day, sh, sm, 0, tzinfo=timezone.utc)
    end_date = shift_date
    if crosses_midnight or (eh, em) <= (sh, sm):
        end_date = shift_date + timedelta(days=1)
    end_dt = datetime(end_date.year, end_date.month, end_date.day, eh, em, 0, tzinfo=timezone.utc)
    ev = CalendarEvent(
        org_id=org_id,
        user_id=user_id,
        title=f"Shift: {template_name}",
        start_time=start_dt,
        end_time=end_dt,
        event_type="general",
        source="shift",
        external_id=f"shift_{assignment_id}",
    )
    db.add(ev)


class ShiftTemplateIn(BaseModel):
    name: str
    shift_type: str = "custom"  # morning, afternoon, night, custom
    start_time: str  # HH:MM
    end_time: str    # HH:MM
    crosses_midnight: bool = False


class ShiftAssignmentIn(BaseModel):
    template_id: uuid.UUID
    user_id: uuid.UUID
    shift_date: date
    notes: Optional[str] = None


class ShiftSwapRequestIn(BaseModel):
    requester_assignment_id: uuid.UUID
    target_user_id: uuid.UUID
    target_assignment_id: Optional[uuid.UUID] = None
    reason: Optional[str] = None


class ShiftSwapReviewIn(BaseModel):
    status: str  # approved | rejected
    review_comment: Optional[str] = None


@router.get("/templates")
def list_shift_templates(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    rows = db.execute(
        text("SELECT * FROM shift_templates WHERE org_id=:org AND is_active=true ORDER BY name"),
        {"org": str(org_id)},
    ).mappings().all()
    return {"templates": [dict(r) for r in rows]}


@router.post("/templates")
def create_shift_template(
    body: ShiftTemplateIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_admin),
):
    row = db.execute(
        text(
            """INSERT INTO shift_templates
               (id, org_id, name, shift_type, start_time, end_time, crosses_midnight, created_by)
               VALUES (:id, :org, :name, :stype, :start_time, :end_time, :cm, :created_by)
               RETURNING *"""
        ),
        {
            "id": str(uuid.uuid4()),
            "org": str(org_id),
            "name": body.name.strip(),
            "stype": body.shift_type,
            "start_time": body.start_time,
            "end_time": body.end_time,
            "cm": body.crosses_midnight,
            "created_by": str(user_id),
        },
    ).mappings().first()
    db.commit()
    return {"template": dict(row)}


@router.post("/assignments")
def create_shift_assignment(
    body: ShiftAssignmentIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_manager),
):
    exists = db.execute(
        text(
            """SELECT id FROM shift_assignments
               WHERE org_id=:org AND user_id=:uid AND shift_date=:sdate AND status IN ('assigned', 'approved')"""
        ),
        {"org": str(org_id), "uid": str(body.user_id), "sdate": body.shift_date},
    ).first()
    if exists:
        raise HTTPException(status_code=409, detail="User already has an assignment for this date")

    row = db.execute(
        text(
            """INSERT INTO shift_assignments
               (id, org_id, template_id, user_id, shift_date, status, notes, created_by)
               VALUES (:id, :org, :template_id, :uid, :sdate, 'assigned', :notes, :created_by)
               RETURNING *"""
        ),
        {
            "id": str(uuid.uuid4()),
            "org": str(org_id),
            "template_id": str(body.template_id),
            "uid": str(body.user_id),
            "sdate": body.shift_date,
            "notes": body.notes,
            "created_by": str(user_id),
        },
    ).mappings().first()
    db.commit()
    # Sync to main calendar
    try:
        template = db.execute(
            text("SELECT name, start_time, end_time, crosses_midnight FROM shift_templates WHERE id = :id"),
            {"id": str(body.template_id)},
        ).mappings().first()
        if template:
            _sync_shift_to_calendar(
                db, org_id, row["id"],
                row["user_id"], row["shift_date"],
                template["name"], template["start_time"], template["end_time"],
                template.get("crosses_midnight") or False,
            )
            db.commit()
    except Exception as e:
        logger.warning("Shift->calendar sync failed (non-fatal): %s", e)
        db.rollback()
    return {"assignment": dict(row)}


@router.get("/my")
def my_shifts(
    days: int = 14,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    start = date.today()
    end = start + timedelta(days=max(1, min(days, 60)))
    rows = db.execute(
        text(
            """SELECT sa.*, st.name AS shift_name, st.shift_type, st.start_time, st.end_time, st.crosses_midnight
               FROM shift_assignments sa
               JOIN shift_templates st ON st.id = sa.template_id
               WHERE sa.org_id=:org AND sa.user_id=:uid AND sa.shift_date BETWEEN :start AND :end
               ORDER BY sa.shift_date ASC"""
        ),
        {"org": str(org_id), "uid": str(user_id), "start": start, "end": end},
    ).mappings().all()
    return {"assignments": [dict(r) for r in rows]}


@router.get("/team")
def team_shifts(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    rows = db.execute(
        text(
            """SELECT sa.*, st.name AS shift_name, st.shift_type, st.start_time, st.end_time,
                      u.name AS employee_name, u.email
               FROM shift_assignments sa
               JOIN shift_templates st ON st.id = sa.template_id
               JOIN users_legacy u ON u.user_id = sa.user_id
               WHERE sa.org_id=:org AND sa.shift_date BETWEEN :start AND :end
               ORDER BY sa.shift_date ASC, u.name ASC"""
        ),
        {"org": str(org_id), "start": start_date, "end": end_date},
    ).mappings().all()
    return {"assignments": [dict(r) for r in rows]}


@router.post("/swap-requests")
def request_shift_swap(
    body: ShiftSwapRequestIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    assignment = db.execute(
        text("SELECT * FROM shift_assignments WHERE id=:id AND org_id=:org"),
        {"id": str(body.requester_assignment_id), "org": str(org_id)},
    ).mappings().first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if str(assignment["user_id"]) != str(user_id):
        raise HTTPException(status_code=403, detail="You can only request swaps for your own assignment")

    row = db.execute(
        text(
            """INSERT INTO shift_swap_requests
               (id, org_id, requester_user_id, requester_assignment_id, target_user_id, target_assignment_id, reason)
               VALUES (:id, :org, :req_uid, :req_assignment, :target_uid, :target_assignment, :reason)
               RETURNING *"""
        ),
        {
            "id": str(uuid.uuid4()),
            "org": str(org_id),
            "req_uid": str(user_id),
            "req_assignment": str(body.requester_assignment_id),
            "target_uid": str(body.target_user_id),
            "target_assignment": str(body.target_assignment_id) if body.target_assignment_id else None,
            "reason": body.reason,
        },
    ).mappings().first()
    db.commit()
    return {"swap_request": dict(row)}


@router.get("/swap-requests")
def list_swap_requests(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    q = """
        SELECT ssr.*, ru.name AS requester_name, tu.name AS target_name
        FROM shift_swap_requests ssr
        LEFT JOIN users_legacy ru ON ru.user_id = ssr.requester_user_id
        LEFT JOIN users_legacy tu ON tu.user_id = ssr.target_user_id
        WHERE ssr.org_id=:org
    """
    params = {"org": str(org_id)}
    if status:
        q += " AND ssr.status=:status"
        params["status"] = status
    q += " ORDER BY ssr.created_at DESC"
    rows = db.execute(text(q), params).mappings().all()
    return {"requests": [dict(r) for r in rows]}


@router.post("/swap-requests/{request_id}/review")
def review_swap_request(
    request_id: uuid.UUID,
    body: ShiftSwapReviewIn,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    reviewer_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(require_manager),
):
    if body.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Status must be approved or rejected")

    req = db.execute(
        text("SELECT * FROM shift_swap_requests WHERE id=:id AND org_id=:org"),
        {"id": str(request_id), "org": str(org_id)},
    ).mappings().first()
    if not req:
        raise HTTPException(status_code=404, detail="Swap request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Swap request already reviewed")

    if body.status == "approved" and req.get("target_assignment_id"):
        req_assignment = db.execute(
            text("SELECT * FROM shift_assignments WHERE id=:id"),
            {"id": str(req["requester_assignment_id"])},
        ).mappings().first()
        target_assignment = db.execute(
            text("SELECT * FROM shift_assignments WHERE id=:id"),
            {"id": str(req["target_assignment_id"])},
        ).mappings().first()
        if req_assignment and target_assignment:
            db.execute(
                text("UPDATE shift_assignments SET user_id=:uid, updated_at=:now WHERE id=:id"),
                {"uid": str(req["target_user_id"]), "id": str(req_assignment["id"]), "now": datetime.utcnow()},
            )
            db.execute(
                text("UPDATE shift_assignments SET user_id=:uid, updated_at=:now WHERE id=:id"),
                {"uid": str(req["requester_user_id"]), "id": str(target_assignment["id"]), "now": datetime.utcnow()},
            )

    db.commit()
    # Keep main calendar in sync: reassign calendar events to new owners after swap
    if body.status == "approved" and req.get("target_assignment_id"):
        try:
            for assignment_id, new_user_id in [
                (str(req["requester_assignment_id"]), str(req["target_user_id"])),
                (str(req["target_assignment_id"]), str(req["requester_user_id"])),
            ]:
                db.query(CalendarEvent).filter(
                    CalendarEvent.org_id == org_id,
                    CalendarEvent.source == "shift",
                    CalendarEvent.external_id == f"shift_{assignment_id}",
                ).update({"user_id": uuid.UUID(new_user_id)}, synchronize_session=False)
            db.commit()
        except Exception as e:
            logger.warning("Shift swap calendar update failed (non-fatal): %s", e)
            db.rollback()

    db.execute(
        text(
            """UPDATE shift_swap_requests
               SET status=:status, reviewed_by=:reviewed_by, reviewed_at=:reviewed_at,
                   review_comment=:comment, updated_at=:updated_at
               WHERE id=:id"""
        ),
        {
            "status": body.status,
            "reviewed_by": str(reviewer_id),
            "reviewed_at": datetime.utcnow(),
            "comment": body.review_comment,
            "updated_at": datetime.utcnow(),
            "id": str(request_id),
        },
    )
    db.commit()
    return {"ok": True, "status": body.status}


@router.get("/dashboard")
def shift_dashboard(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    today = date.today()
    end = today + timedelta(days=7)
    assignment_count = db.execute(
        text("SELECT COUNT(*) FROM shift_assignments WHERE org_id=:org AND shift_date BETWEEN :start AND :end"),
        {"org": str(org_id), "start": today, "end": end},
    ).scalar() or 0
    pending_swaps = db.execute(
        text("SELECT COUNT(*) FROM shift_swap_requests WHERE org_id=:org AND status='pending'"),
        {"org": str(org_id)},
    ).scalar() or 0
    by_type = db.execute(
        text(
            """SELECT st.shift_type, COUNT(*) AS count
               FROM shift_assignments sa
               JOIN shift_templates st ON st.id = sa.template_id
               WHERE sa.org_id=:org AND sa.shift_date BETWEEN :start AND :end
               GROUP BY st.shift_type"""
        ),
        {"org": str(org_id), "start": today, "end": end},
    ).mappings().all()
    return {
        "window_start": today,
        "window_end": end,
        "assignments_next_7_days": assignment_count,
        "pending_swap_requests": pending_swaps,
        "by_shift_type": [dict(r) for r in by_type],
    }
