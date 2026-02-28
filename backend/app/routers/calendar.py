"""Calendar events router."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from datetime import datetime, date, timedelta
from typing import Optional

from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id, get_current_role
from app.models.calendar_event import CalendarEvent
from app.models.user import User
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
        event_type=body.event_type,
        location=body.location,
        is_virtual=body.is_virtual,
        meeting_link=body.meeting_link,
        recurrence=body.recurrence,
        recurrence_end=body.recurrence_end,
        attendees=body.attendees or [],
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


@router.get("/colleagues")
def list_colleagues(
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    users = db.query(User).filter(
        User.org_id == org_id,
        User.is_active == True,
    ).all()
    return [
        {
            "id": str(u.user_id),
            "name": u.name or u.email or "Unknown",
            "email": u.email or "",
        }
        for u in users
    ]


@router.get("/date/{date_str}", response_model=list[CalendarEventResponse])
def events_for_date(
    date_str: str,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    try:
        d = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(400, "Invalid date format, use YYYY-MM-DD")

    start = datetime(d.year, d.month, d.day)
    end = start + timedelta(days=1)

    return db.query(CalendarEvent).filter(
        CalendarEvent.org_id == org_id,
        or_(CalendarEvent.user_id == user_id, CalendarEvent.is_shared == True),
        CalendarEvent.start_time >= start,
        CalendarEvent.start_time < end,
    ).order_by(CalendarEvent.start_time).all()


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


# ── New endpoints ──


class RSVPBody(BaseModel):
    status: str  # "accepted", "declined", "tentative"


@router.post("/{event_id}/rsvp")
def rsvp_event(
    event_id: uuid.UUID,
    body: RSVPBody,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    if body.status not in ("accepted", "declined", "tentative"):
        raise HTTPException(400, "Status must be accepted, declined, or tentative")

    event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id,
        CalendarEvent.org_id == org_id,
    ).first()
    if not event:
        raise HTTPException(404, "Event not found")

    attendees = list(event.attendees or [])
    uid = str(user_id)
    found = False
    for att in attendees:
        if att.get("id") == uid:
            att["status"] = body.status
            found = True
            break
    if not found:
        attendees.append({"id": uid, "status": body.status})

    event.attendees = attendees
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(event, "attendees")
    db.commit()
    db.refresh(event)
    return {"ok": True, "attendees": event.attendees}


