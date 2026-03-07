"""Calendar events router — Sprint 4 extended."""

import uuid
import os
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime, date, timedelta
from typing import Optional

from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id, get_current_role
from app.models.calendar_event import CalendarEvent
from app.models.user import User
from app.schemas.calendar import CalendarEventCreate, CalendarEventUpdate, CalendarEventResponse

router = APIRouter(prefix="/api/v1/calendar", tags=["Calendar"])


# ─────────────────────────────────────────────────────────────────────
# Existing endpoints — unchanged except source="native" on create
# and guard against editing external events on PUT
# ─────────────────────────────────────────────────────────────────────

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
        source="native",
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
    # Block edits on externally synced events
    if getattr(event, "source", "native") not in ("native", None):
        raise HTTPException(400, "External events cannot be edited here — update in the source calendar")

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


# ─────────────────────────────────────────────────────────────────────
# Sprint 4 — Complete event
# ─────────────────────────────────────────────────────────────────────

@router.post("/{event_id}/complete")
def complete_event(
    event_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    """Mark a 1:1, task, or meeting as completed."""
    event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id,
        CalendarEvent.org_id == org_id,
    ).first()
    if not event:
        raise HTTPException(404, "Event not found")
    if event.user_id != user_id and role not in ("hr_admin", "super_admin", "manager"):
        raise HTTPException(403, "Not authorized")

    event.is_completed = True
    event.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(event)
    return {"ok": True, "completed_at": event.completed_at.isoformat()}


# ─────────────────────────────────────────────────────────────────────
# Sprint 4 — Upcoming events (dashboard widget)
# ─────────────────────────────────────────────────────────────────────

@router.get("/upcoming/me")
def upcoming_events(
    days: int = Query(7, ge=1, le=30),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Next N days of events for current user — used by dashboard widget."""
    now = datetime.utcnow()
    cutoff = now + timedelta(days=days)

    events = db.query(CalendarEvent).filter(
        CalendarEvent.org_id == org_id,
        or_(CalendarEvent.user_id == user_id, CalendarEvent.is_shared == True),
        CalendarEvent.start_time >= now,
        CalendarEvent.start_time <= cutoff,
        CalendarEvent.is_completed == False,
    ).order_by(CalendarEvent.start_time).limit(20).all()

    return [
        {
            "id": str(e.id),
            "title": e.title,
            "start_time": e.start_time.isoformat() if e.start_time else None,
            "end_time": e.end_time.isoformat() if e.end_time else None,
            "is_all_day": e.is_all_day,
            "event_type": str(e.event_type) if e.event_type else "meeting",
            "color": e.color,
            "location": e.location,
            "is_virtual": e.is_virtual,
            "meeting_link": e.meeting_link,
            "source": getattr(e, "source", "native"),
        }
        for e in events
    ]


# ─────────────────────────────────────────────────────────────────────
# Sprint 4 — Google Calendar OAuth sync
# Requires env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
#                    GOOGLE_REDIRECT_URI, FRONTEND_URL
# Python deps: google-auth-oauthlib google-api-python-client
# ─────────────────────────────────────────────────────────────────────

def _get_google_flow():
    try:
        from google_auth_oauthlib.flow import Flow
    except ImportError:
        raise HTTPException(503, "Google integration not installed. Run: pip install google-auth-oauthlib google-api-python-client")

    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")

    if not all([client_id, client_secret, redirect_uri]):
        raise HTTPException(503, "Google Calendar env vars not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)")

    from google_auth_oauthlib.flow import Flow
    return Flow.from_client_config(
        {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uris": [redirect_uri],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=["https://www.googleapis.com/auth/calendar.readonly"],
        redirect_uri=redirect_uri,
    )


def _get_user_setting(db: Session, user_id: uuid.UUID, key: str):
    try:
        from app.models.user_settings import UserSettings
        row = db.query(UserSettings).filter(
            UserSettings.user_id == user_id,
            UserSettings.key == key,
        ).first()
        return json.loads(row.value) if row else None
    except Exception:
        return None


def _set_user_setting(db: Session, user_id: uuid.UUID, key: str, value: dict):
    try:
        from app.models.user_settings import UserSettings
        row = db.query(UserSettings).filter(
            UserSettings.user_id == user_id,
            UserSettings.key == key,
        ).first()
        serialized = json.dumps(value)
        if row:
            row.value = serialized
        else:
            db.add(UserSettings(user_id=user_id, key=key, value=serialized))
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to save token: {e}")


def _delete_user_setting(db: Session, user_id: uuid.UUID, key: str):
    try:
        from app.models.user_settings import UserSettings
        db.query(UserSettings).filter(
            UserSettings.user_id == user_id,
            UserSettings.key == key,
        ).delete()
        db.commit()
    except Exception:
        db.rollback()


@router.get("/google/auth")
def google_auth_start(
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Return Google OAuth URL. Frontend should window.location.href to auth_url."""
    flow = _get_google_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        state=str(user_id),
        prompt="consent",
    )
    return {"auth_url": auth_url}


@router.get("/google/callback")
def google_auth_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
):
    """OAuth callback — stores token in user_settings, redirects to /calendar."""
    flow = _get_google_flow()
    flow.fetch_token(code=code)
    token_data = {
        "token": flow.credentials.token,
        "refresh_token": flow.credentials.refresh_token,
        "token_uri": flow.credentials.token_uri,
        "client_id": flow.credentials.client_id,
        "client_secret": flow.credentials.client_secret,
        "scopes": list(flow.credentials.scopes or []),
        "synced_at": None,
    }
    user_id = uuid.UUID(state)
    _set_user_setting(db, user_id, "google_calendar_token", token_data)

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    return RedirectResponse(f"{frontend_url}/calendar?google_connected=1")


@router.post("/google/sync")
def google_sync(
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Pull next 30 days from Google Calendar into calendar_events (upsert by external_id)."""
    token_data = _get_user_setting(db, user_id, "google_calendar_token")
    if not token_data:
        raise HTTPException(400, "Google Calendar not connected")

    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
    except ImportError:
        raise HTTPException(503, "Google Calendar integration not installed")

    creds = Credentials(
        token=token_data["token"],
        refresh_token=token_data.get("refresh_token"),
        token_uri=token_data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=token_data.get("client_id"),
        client_secret=token_data.get("client_secret"),
        scopes=token_data.get("scopes", []),
    )

    service = build("calendar", "v3", credentials=creds)
    now = datetime.utcnow()
    result = service.events().list(
        calendarId="primary",
        timeMin=now.isoformat() + "Z",
        timeMax=(now + timedelta(days=30)).isoformat() + "Z",
        singleEvents=True,
        orderBy="startTime",
        maxResults=100,
    ).execute()

    created = 0
    updated = 0

    for ge in result.get("items", []):
        external_id = ge.get("id")
        if not external_id:
            continue

        start_raw = ge.get("start", {})
        end_raw = ge.get("end", {})
        is_all_day = "date" in start_raw and "dateTime" not in start_raw

        try:
            if is_all_day:
                start_time = datetime.fromisoformat(start_raw["date"])
                end_time = datetime.fromisoformat(end_raw.get("date", start_raw["date"]))
            else:
                start_time = datetime.fromisoformat(start_raw["dateTime"].replace("Z", "+00:00"))
                end_time = datetime.fromisoformat(end_raw["dateTime"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue

        existing = db.query(CalendarEvent).filter(
            CalendarEvent.org_id == org_id,
            CalendarEvent.external_id == external_id,
        ).first()

        if existing:
            existing.title = ge.get("summary", "Google Event")
            existing.description = ge.get("description")
            existing.start_time = start_time
            existing.end_time = end_time
            existing.is_all_day = is_all_day
            existing.location = ge.get("location")
            existing.meeting_link = ge.get("hangoutLink")
            updated += 1
        else:
            db.add(CalendarEvent(
                org_id=org_id,
                user_id=user_id,
                created_by=user_id,
                title=ge.get("summary", "Google Event"),
                description=ge.get("description"),
                start_time=start_time,
                end_time=end_time,
                is_all_day=is_all_day,
                is_shared=False,
                location=ge.get("location"),
                meeting_link=ge.get("hangoutLink"),
                is_virtual=bool(ge.get("hangoutLink")),
                attendees=[],
                source="google",
                external_id=external_id,
                color="#4285f4",
            ))
            created += 1

    synced_at = datetime.utcnow().isoformat()
    token_data["synced_at"] = synced_at
    _set_user_setting(db, user_id, "google_calendar_token", token_data)
    db.commit()

    return {"ok": True, "created": created, "updated": updated, "synced_at": synced_at}


@router.get("/google/status")
def google_sync_status(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Check if Google Calendar is connected and when it last synced."""
    token_data = _get_user_setting(db, user_id, "google_calendar_token")
    if not token_data:
        return {"connected": False}
    return {"connected": True, "synced_at": token_data.get("synced_at")}


@router.delete("/google/disconnect")
def google_disconnect(
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Revoke token and delete all Google-sourced events for this user."""
    token_data = _get_user_setting(db, user_id, "google_calendar_token")
    if token_data:
        try:
            import requests
            requests.post(
                "https://oauth2.googleapis.com/revoke",
                params={"token": token_data.get("token")},
                timeout=5,
            )
        except Exception:
            pass  # non-fatal

    db.query(CalendarEvent).filter(
        CalendarEvent.org_id == org_id,
        CalendarEvent.user_id == user_id,
        CalendarEvent.source == "google",
    ).delete()

    _delete_user_setting(db, user_id, "google_calendar_token")
    db.commit()
    return {"ok": True, "message": "Google Calendar disconnected"}
