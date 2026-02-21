"""Calendar events router."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from datetime import datetime
from typing import Optional

from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id, get_current_role
from app.models.calendar_event import CalendarEvent
from app.schemas.calendar import CalendarEventCreate, CalendarEventUpdate, CalendarEventResponse

router = APIRouter(prefix="/api/v1/calendar", tags=["Calendar"])


@router.post("/", response_model=CalendarEventResponse)
def create_event(
    body: CalendarEventCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    if body.is_shared and role not in ("hr_admin", "super_admin", "manager"):
        raise HTTPException(403, "Only admins/managers can create shared events")

    event = CalendarEvent(
        org_id=org_id,
        user_id=user_id,
        title=body.title,
        description=body.description,
        start_time=body.start_time,
        end_time=body.end_time,
        is_all_day=body.is_all_day,
        is_shared=body.is_shared,
        color=body.color,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("/", response_model=list[CalendarEventResponse])
def list_events(
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    q = db.query(CalendarEvent).filter(
        CalendarEvent.org_id == org_id,
        or_(
            CalendarEvent.user_id == user_id,
            CalendarEvent.is_shared == True,
        ),
    )
    if start:
        q = q.filter(CalendarEvent.start_time >= start)
    if end:
        q = q.filter(CalendarEvent.start_time <= end)
    return q.order_by(CalendarEvent.start_time).all()


@router.get("/{event_id}", response_model=CalendarEventResponse)
def get_event(
    event_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id,
        CalendarEvent.org_id == org_id,
        or_(CalendarEvent.user_id == user_id, CalendarEvent.is_shared == True),
    ).first()
    if not event:
        raise HTTPException(404, "Event not found")
    return event


@router.put("/{event_id}", response_model=CalendarEventResponse)
def update_event(
    event_id: uuid.UUID,
    body: CalendarEventUpdate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id,
        CalendarEvent.org_id == org_id,
    ).first()
    if not event:
        raise HTTPException(404, "Event not found")
    if event.user_id != user_id and role not in ("hr_admin", "super_admin"):
        raise HTTPException(403, "Not authorized to edit this event")

    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(event, field, val)
    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}")
def delete_event(
    event_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id,
        CalendarEvent.org_id == org_id,
    ).first()
    if not event:
        raise HTTPException(404, "Event not found")
    if event.user_id != user_id and role not in ("hr_admin", "super_admin"):
        raise HTTPException(403, "Not authorized to delete this event")

    db.delete(event)
    db.commit()
    return {"ok": True}
