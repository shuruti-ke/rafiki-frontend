from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.announcement import Announcement, AnnouncementRead, TrainingAssignment
from app.schemas.announcements import (
    AnnouncementCreate, AnnouncementResponse, AnnouncementUpdate,
    ReadReceiptResponse, TrainingAssignmentCreate, TrainingAssignmentResponse,
)
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/announcements", tags=["Announcements"])

DEMO_ORG_ID = 1
DEMO_USER_ID = 1
DEMO_IS_ADMIN = True


@router.post("/", response_model=AnnouncementResponse)
def create_announcement(data: AnnouncementCreate, db: Session = Depends(get_db)):
    ann = Announcement(
        org_id=DEMO_ORG_ID,
        title=data.title,
        content=data.content,
        is_training=data.is_training,
        target_departments=data.target_departments,
        target_roles=data.target_roles,
        priority=data.priority,
        expires_at=data.expires_at,
        created_by=DEMO_USER_ID,
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)

    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "create", "announcement", ann.id, {"title": data.title})
    return ann


@router.get("/", response_model=list[AnnouncementResponse])
def list_announcements(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(Announcement).filter(Announcement.org_id == DEMO_ORG_ID)
    return q.order_by(Announcement.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/{ann_id}", response_model=AnnouncementResponse)
def get_announcement(ann_id: int, db: Session = Depends(get_db)):
    ann = db.query(Announcement).filter(
        Announcement.id == ann_id, Announcement.org_id == DEMO_ORG_ID
    ).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    # Auto-create read receipt
    existing = db.query(AnnouncementRead).filter(
        AnnouncementRead.announcement_id == ann_id,
        AnnouncementRead.user_id == DEMO_USER_ID,
    ).first()
    if not existing:
        read = AnnouncementRead(announcement_id=ann_id, user_id=DEMO_USER_ID)
        db.add(read)
        db.commit()

    return ann


@router.put("/{ann_id}", response_model=AnnouncementResponse)
def update_announcement(ann_id: int, update: AnnouncementUpdate, db: Session = Depends(get_db)):
    ann = db.query(Announcement).filter(
        Announcement.id == ann_id, Announcement.org_id == DEMO_ORG_ID
    ).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(ann, field, value)

    db.commit()
    db.refresh(ann)

    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "update", "announcement", ann.id, update.model_dump(exclude_unset=True))
    return ann


@router.delete("/{ann_id}")
def delete_announcement(ann_id: int, db: Session = Depends(get_db)):
    ann = db.query(Announcement).filter(
        Announcement.id == ann_id, Announcement.org_id == DEMO_ORG_ID
    ).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    db.delete(ann)
    db.commit()

    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "delete", "announcement", ann_id)
    return {"ok": True, "message": "Announcement deleted"}


@router.post("/{ann_id}/publish", response_model=AnnouncementResponse)
def publish_announcement(ann_id: int, db: Session = Depends(get_db)):
    ann = db.query(Announcement).filter(
        Announcement.id == ann_id, Announcement.org_id == DEMO_ORG_ID
    ).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    ann.published_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ann)

    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "publish", "announcement", ann.id)
    return ann


@router.get("/{ann_id}/reads", response_model=list[ReadReceiptResponse])
def get_read_receipts(ann_id: int, db: Session = Depends(get_db)):
    ann = db.query(Announcement).filter(
        Announcement.id == ann_id, Announcement.org_id == DEMO_ORG_ID
    ).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    return db.query(AnnouncementRead).filter(
        AnnouncementRead.announcement_id == ann_id
    ).all()


@router.post("/{ann_id}/assign-training", response_model=list[TrainingAssignmentResponse])
def assign_training(ann_id: int, data: TrainingAssignmentCreate, db: Session = Depends(get_db)):
    ann = db.query(Announcement).filter(
        Announcement.id == ann_id, Announcement.org_id == DEMO_ORG_ID
    ).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    assignments = []
    for uid in data.user_ids:
        existing = db.query(TrainingAssignment).filter(
            TrainingAssignment.announcement_id == ann_id,
            TrainingAssignment.user_id == uid,
        ).first()
        if existing:
            continue

        ta = TrainingAssignment(
            announcement_id=ann_id,
            user_id=uid,
            assigned_by=DEMO_USER_ID,
            due_date=data.due_date,
        )
        db.add(ta)
        assignments.append(ta)

    db.commit()
    for a in assignments:
        db.refresh(a)

    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "assign_training", "announcement", ann_id, {"user_ids": data.user_ids})
    return assignments


@router.get("/{ann_id}/training-status", response_model=list[TrainingAssignmentResponse])
def get_training_status(ann_id: int, db: Session = Depends(get_db)):
    return db.query(TrainingAssignment).filter(
        TrainingAssignment.announcement_id == ann_id
    ).all()


@router.post("/{ann_id}/complete-training", response_model=TrainingAssignmentResponse)
def complete_training(ann_id: int, db: Session = Depends(get_db)):
    ta = db.query(TrainingAssignment).filter(
        TrainingAssignment.announcement_id == ann_id,
        TrainingAssignment.user_id == DEMO_USER_ID,
    ).first()
    if not ta:
        raise HTTPException(status_code=404, detail="Training assignment not found")

    ta.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ta)

    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "complete_training", "announcement", ann_id)
    return ta
