from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.models.announcement import Announcement, AnnouncementRead, TrainingAssignment
from app.models.user import User  # needed for unread-employee lookup
from app.schemas.announcements import (
    AnnouncementCreate,
    AnnouncementResponse,
    AnnouncementUpdate,
    ReadReceiptResponse,
    TrainingAssignmentCreate,
    TrainingAssignmentResponse,
)
from app.services.audit import log_action
from app.routers.notifications import _insert_notification

# ✅ Use real auth deps (JWT or demo-header fallback)
from app.dependencies import get_current_org_id, get_current_user_id, require_admin

router = APIRouter(prefix="/api/v1/announcements", tags=["Announcements"])


@router.post("/", response_model=AnnouncementResponse)
def create_announcement(
    data: AnnouncementCreate,
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    role: str = Depends(require_admin),
):
    ann = Announcement(
        org_id=org_id,
        title=data.title,
        content=data.content,
        is_training=data.is_training,
        target_departments=data.target_departments,
        target_roles=data.target_roles,
        priority=data.priority,
        published_at=datetime.now(timezone.utc),
        expires_at=data.expires_at,
        created_by=user_id,
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)

    log_action(db, org_id, user_id, "create", "announcement", ann.id, {"title": data.title})

    # ── Sprint 5: notify all active org employees ─────────────────────
    try:
        employees = db.query(User.user_id).filter(
            User.org_id == org_id,
            User.is_active == True,
            User.user_id != user_id,   # don't notify the creator
        ).all()
        for (emp_id,) in employees:
            _insert_notification(db, user_id=emp_id, org_id=org_id,
                kind="announcement_unread",
                title=ann.title,
                body=ann.content[:120] + "…" if ann.content and len(ann.content) > 120 else ann.content,
                link=f"/announcements/{ann.id}")
        db.commit()
    except Exception as _e:
        pass  # non-fatal — announcement was already saved
    # ── end Sprint 5 ─────────────────────────────────────────────────

    return ann


@router.get("/", response_model=list[AnnouncementResponse])
def list_announcements(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, le=100),
    include_unpublished: bool = Query(default=False),
    include_expired: bool = Query(default=False),
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
):
    q = db.query(Announcement).filter(Announcement.org_id == org_id)

    if not include_unpublished:
        q = q.filter(Announcement.published_at.isnot(None))

    if not include_expired:
        now = datetime.now(timezone.utc)
        q = q.filter(or_(Announcement.expires_at.is_(None), Announcement.expires_at > now))

    return q.order_by(Announcement.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/{ann_id}", response_model=AnnouncementResponse)
def get_announcement(
    ann_id: UUID,
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
):
    ann = (
        db.query(Announcement)
        .filter(Announcement.id == ann_id, Announcement.org_id == org_id)
        .first()
    )
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    # Auto-create read receipt (idempotent)
    existing = (
        db.query(AnnouncementRead)
        .filter(
            AnnouncementRead.announcement_id == ann_id,
            AnnouncementRead.user_id == user_id,
        )
        .first()
    )
    if not existing:
        read = AnnouncementRead(announcement_id=ann_id, user_id=user_id)
        db.add(read)
        db.commit()

    return ann


@router.put("/{ann_id}", response_model=AnnouncementResponse)
def update_announcement(
    ann_id: UUID,
    update: AnnouncementUpdate,
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    role: str = Depends(require_admin),
):
    ann = (
        db.query(Announcement)
        .filter(Announcement.id == ann_id, Announcement.org_id == org_id)
        .first()
    )
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(ann, field, value)

    db.commit()
    db.refresh(ann)

    log_action(
        db, org_id, user_id, "update", "announcement", ann.id,
        update.model_dump(exclude_unset=True),
    )
    return ann


@router.delete("/{ann_id}")
def delete_announcement(
    ann_id: UUID,
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    role: str = Depends(require_admin),
):
    ann = (
        db.query(Announcement)
        .filter(Announcement.id == ann_id, Announcement.org_id == org_id)
        .first()
    )
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    db.delete(ann)
    db.commit()

    log_action(db, org_id, user_id, "delete", "announcement", ann_id)
    return {"ok": True, "message": "Announcement deleted"}


@router.post("/{ann_id}/publish", response_model=AnnouncementResponse)
def publish_announcement(
    ann_id: UUID,
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    role: str = Depends(require_admin),
):
    ann = (
        db.query(Announcement)
        .filter(Announcement.id == ann_id, Announcement.org_id == org_id)
        .first()
    )
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    ann.published_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ann)

    log_action(db, org_id, user_id, "publish", "announcement", ann.id)
    return ann


@router.get("/{ann_id}/reads", response_model=list[ReadReceiptResponse])
def get_read_receipts(
    ann_id: UUID,
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    role: str = Depends(require_admin),
):
    ann = (
        db.query(Announcement)
        .filter(Announcement.id == ann_id, Announcement.org_id == org_id)
        .first()
    )
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    return (
        db.query(AnnouncementRead)
        .filter(AnnouncementRead.announcement_id == ann_id)
        .all()
    )


# ─────────────────────────────────────────────────────────────
# SPRINT 2: Send reminder to employees who haven't read yet
# POST /api/v1/announcements/{id}/remind
# ─────────────────────────────────────────────────────────────
@router.post("/{ann_id}/remind")
def send_reminder(
    ann_id: UUID,
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    role: str = Depends(require_admin),
):
    """
    Send a reminder notification to all active employees in the org
    who have NOT yet created a read receipt for this announcement.
    Returns a count of employees reminded.
    """
    ann = (
        db.query(Announcement)
        .filter(Announcement.id == ann_id, Announcement.org_id == org_id)
        .first()
    )
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    if not ann.published_at:
        raise HTTPException(status_code=400, detail="Cannot remind for an unpublished announcement")

    # All user IDs who have already read this announcement
    read_user_ids = {
        row.user_id
        for row in db.query(AnnouncementRead)
        .filter(AnnouncementRead.announcement_id == ann_id)
        .all()
    }

    # All active employees in this org who haven't read it
    unread_employees = (
        db.query(User)
        .filter(
            User.org_id == org_id,
            User.is_active == True,
            User.user_id.notin_(read_user_ids),
        )
        .all()
    )

    if not unread_employees:
        return {"ok": True, "reminded": 0, "message": "All employees have already read this announcement"}

    # Dispatch in-app notifications to unread employees
    for employee in unread_employees:
        _insert_notification(db, user_id=employee.user_id, org_id=org_id,
            kind="announcement_unread",
            title=f"Reminder: {ann.title}",
            body="You haven't read this announcement yet.",
            link=f"/announcements/{ann_id}")

    db.commit()

    reminded_count = len(unread_employees)

    log_action(
        db, org_id, user_id, "remind", "announcement", ann_id,
        {"reminded_count": reminded_count},
    )

    return {
        "ok": True,
        "reminded": reminded_count,
        "message": f"Reminder sent to {reminded_count} employee{'s' if reminded_count != 1 else ''}",
    }


@router.post("/{ann_id}/assign-training", response_model=list[TrainingAssignmentResponse])
def assign_training(
    ann_id: UUID,
    data: TrainingAssignmentCreate,
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    role: str = Depends(require_admin),
):
    ann = (
        db.query(Announcement)
        .filter(Announcement.id == ann_id, Announcement.org_id == org_id)
        .first()
    )
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    assignments = []
    for uid in data.user_ids:
        existing = (
            db.query(TrainingAssignment)
            .filter(
                TrainingAssignment.announcement_id == ann_id,
                TrainingAssignment.user_id == uid,
            )
            .first()
        )
        if existing:
            continue

        ta = TrainingAssignment(
            announcement_id=ann_id,
            user_id=uid,
            assigned_by=user_id,
            due_date=data.due_date,
        )
        db.add(ta)
        assignments.append(ta)

    db.commit()
    for a in assignments:
        db.refresh(a)

    log_action(
        db, org_id, user_id, "assign_training", "announcement", ann_id,
        {"user_ids": [str(x) for x in data.user_ids]},
    )
    return assignments


@router.get("/{ann_id}/training-status", response_model=list[TrainingAssignmentResponse])
def get_training_status(
    ann_id: UUID,
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    role: str = Depends(require_admin),
):
    ann = (
        db.query(Announcement)
        .filter(Announcement.id == ann_id, Announcement.org_id == org_id)
        .first()
    )
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    return (
        db.query(TrainingAssignment)
        .filter(TrainingAssignment.announcement_id == ann_id)
        .all()
    )


@router.post("/{ann_id}/complete-training", response_model=TrainingAssignmentResponse)
def complete_training(
    ann_id: UUID,
    db: Session = Depends(get_db),
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
):
    ann = (
        db.query(Announcement)
        .filter(Announcement.id == ann_id, Announcement.org_id == org_id)
        .first()
    )
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    ta = (
        db.query(TrainingAssignment)
        .filter(
            TrainingAssignment.announcement_id == ann_id,
            TrainingAssignment.user_id == user_id,
        )
        .first()
    )
    if not ta:
        raise HTTPException(status_code=404, detail="Training assignment not found")

    ta.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ta)

    log_action(db, org_id, user_id, "complete_training", "announcement", ann_id)
    return ta
