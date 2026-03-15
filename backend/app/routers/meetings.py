# backend/app/routers/meetings.py
import logging
import uuid
import os
import time
import httpx
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.dependencies import get_current_org_id, get_current_user_id, get_current_role
from app.models.calendar_event import CalendarEvent
from app.models.meeting import Meeting, _generate_room_name
from app.models.user import User
from app.schemas.meetings import (
    MeetingCreate, MeetingUpdate, MeetingResponse,
    AgendaResponse, SummaryRequest, SummaryResponse,
    WellbeingRequest, PushObjectivesRequest,
)

logger = logging.getLogger(__name__)

# ── Jaas config ──
JAAS_APP_ID = os.getenv("JAAS_APP_ID", "").strip()
JAAS_API_KEY_ID = os.getenv("JAAS_API_KEY_ID", "").strip()
JAAS_PRIVATE_KEY = os.getenv("JAAS_PRIVATE_KEY", "").strip().replace("\\n", "\n")
JITSI_BASE_URL = f"https://8x8.vc/{JAAS_APP_ID}" if JAAS_APP_ID else "https://meet.jit.si"

# ── OpenAI config (for meeting objectives / AI features) ──
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com").strip().rstrip("/")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()

# Internal base URL for pushing objectives
INTERNAL_API_BASE = os.getenv("INTERNAL_API_BASE", "https://rafiki-backend.onrender.com")

router = APIRouter(prefix="/api/v1/meetings", tags=["Meetings"])
_PRIVILEGED_ROLES = {"hr_admin", "super_admin"}


# ── Calendar sync helpers ──

def _remove_meeting_from_calendar(db: Session, org_id: uuid.UUID, meeting_id: uuid.UUID) -> None:
    """Remove all calendar events created from a meeting."""
    prefix = f"meeting_{meeting_id}_"
    events = db.query(CalendarEvent).filter(
        CalendarEvent.org_id == org_id,
        CalendarEvent.source == "meeting",
    ).all()
    for ev in events:
        if ev.external_id and ev.external_id.startswith(prefix):
            db.delete(ev)


def _sync_meeting_to_calendar(db: Session, org_id: uuid.UUID, meeting: Meeting) -> None:
    """Create/update calendar events for a scheduled meeting (host + all participants)."""
    from datetime import timedelta, timezone

    _remove_meeting_from_calendar(db, org_id, meeting.id)

    if not meeting.scheduled_at:
        try:
            db.commit()
        except Exception as e:
            logger.warning("Meeting calendar remove failed (non-fatal): %s", e)
            db.rollback()
        return

    start = meeting.scheduled_at
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    end = start + timedelta(minutes=meeting.duration_minutes or 60)
    event_type = "1on1" if meeting.meeting_type == "one_on_one" else "meeting"
    jitsi_url = _build_jitsi_url(meeting.room_name)
    prefix = f"meeting_{meeting.id}_"

    def _add(owner_id, ext_suffix):
        ev = CalendarEvent(
            org_id=org_id,
            user_id=owner_id,
            title=meeting.title,
            description=meeting.description,
            start_time=start,
            end_time=end,
            is_all_day=False,
            is_shared=False,
            event_type=event_type,
            color="#1fbfb8",
            is_virtual=True,
            meeting_link=jitsi_url,
            source="meeting",
            external_id=f"{prefix}{ext_suffix}",
        )
        db.add(ev)

    _add(meeting.host_id, f"host_{meeting.host_id}")
    for pid in (meeting.participant_ids or []):
        try:
            pid_uuid = pid if isinstance(pid, uuid.UUID) else uuid.UUID(str(pid))
            _add(pid_uuid, f"participant_{pid_uuid}")
        except Exception:
            pass

    try:
        db.commit()
    except Exception as e:
        logger.warning("Meeting calendar sync failed (non-fatal): %s", e)
        db.rollback()


# ── Helpers ──

def _build_jitsi_url(room_name: str) -> str:
    return f"{JITSI_BASE_URL}/{room_name}"


def _generate_jaas_token(user_id, user_name, user_email, room_name, is_moderator=False):
    if not JAAS_APP_ID or not JAAS_API_KEY_ID or not JAAS_PRIVATE_KEY:
        return None
    try:
        import jwt
        now = int(time.time())
        payload = {
            "iss": "chat", "aud": "jitsi",
            "iat": now, "exp": now + 7200, "nbf": now - 10,
            "sub": JAAS_APP_ID,
            "context": {
                "user": {
                    "id": str(user_id),
                    "name": user_name or "Rafiki User",
                    "email": user_email or "",
                    "moderator": str(is_moderator).lower(),
                    "avatar": "",
                },
                "features": {
                    "recording": str(is_moderator).lower(),
                    "livestreaming": "false",
                    "transcription": "false",
                    "outbound-call": "false",
                },
            },
            "room": room_name,
        }
        return jwt.encode(payload, JAAS_PRIVATE_KEY, algorithm="RS256",
                          headers={"kid": JAAS_API_KEY_ID, "alg": "RS256"})
    except Exception as e:
        logger.error("Jaas JWT error: %s", e)
        return None


def _openai_chat(system: str, user: str) -> str:
    """Call OpenAI chat completions and return text response."""
    if not OPENAI_API_KEY:
        raise HTTPException(503, "AI not configured (set OPENAI_API_KEY)")
    try:
        base = OPENAI_BASE_URL.rstrip("/")
        url = f"{base}/v1/chat/completions" if "/v1" not in base else f"{base}/chat/completions"
        resp = httpx.post(
            url,
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": OPENAI_MODEL,
                "max_tokens": 1000,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
    except Exception as e:
        logger.error("OpenAI API error: %s", e)
        raise HTTPException(502, f"AI generation failed: {e}")


def _to_response(meeting: Meeting) -> dict:
    d = {c.name: getattr(meeting, c.name) for c in meeting.__table__.columns}
    d["jitsi_url"] = _build_jitsi_url(meeting.room_name)
    return d


# ── CRUD ──

@router.post("", response_model=MeetingResponse)
def create_meeting(
    data: MeetingCreate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    meeting = Meeting(
        org_id=org_id, host_id=user_id,
        title=data.title, description=data.description,
        room_name=_generate_room_name(),
        scheduled_at=data.scheduled_at,
        duration_minutes=data.duration_minutes,
        participant_ids=data.participant_ids or [],
        meeting_type=data.meeting_type,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    _sync_meeting_to_calendar(db, org_id, meeting)
    logger.info("Meeting created: %s by user %s", meeting.id, user_id)
    return _to_response(meeting)


@router.get("", response_model=list[MeetingResponse])
def list_meetings(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    meetings = (
        db.query(Meeting)
        .filter(Meeting.org_id == org_id, Meeting.is_active == True)
        .order_by(Meeting.scheduled_at.desc().nullslast(), Meeting.created_at.desc())
        .all()
    )
    visible = [
        m for m in meetings
        if m.host_id == user_id or (m.participant_ids and user_id in m.participant_ids)
    ]
    return [_to_response(m) for m in visible]


@router.get("/all", response_model=list[MeetingResponse])
def list_all_meetings(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
):
    if role not in _PRIVILEGED_ROLES:
        raise HTTPException(403, "Admin only")
    meetings = (
        db.query(Meeting)
        .filter(Meeting.org_id == org_id, Meeting.is_active == True)
        .order_by(Meeting.scheduled_at.desc().nullslast(), Meeting.created_at.desc())
        .all()
    )
    return [_to_response(m) for m in meetings]


# ── AI endpoints (before /{meeting_id} to avoid route conflict) ──

@router.post("/{meeting_id}/token")
def get_meeting_token(
    meeting_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    meeting = db.query(Meeting).filter(
        Meeting.id == meeting_id, Meeting.org_id == org_id
    ).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    is_participant = meeting.participant_ids and user_id in meeting.participant_ids
    if role not in _PRIVILEGED_ROLES and meeting.host_id != user_id and not is_participant:
        raise HTTPException(403, "Not authorized")
    user = db.query(User).filter(User.user_id == user_id).first()
    user_name = getattr(user, "name", None) or "Rafiki User"
    user_email = getattr(user, "email", None) or ""
    is_moderator = meeting.host_id == user_id or role in _PRIVILEGED_ROLES
    token = _generate_jaas_token(user_id, user_name, user_email, meeting.room_name, is_moderator)
    return {
        "token": token,
        "room_name": meeting.room_name,
        "jitsi_url": _build_jitsi_url(meeting.room_name),
        "app_id": JAAS_APP_ID,
        "is_moderator": is_moderator,
        "jaas_configured": bool(token),
    }


@router.post("/{meeting_id}/agenda", response_model=AgendaResponse)
def generate_agenda(
    meeting_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Generate a meeting agenda using Claude based on meeting context."""
    meeting = db.query(Meeting).filter(
        Meeting.id == meeting_id, Meeting.org_id == org_id
    ).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    system = (
        "You are Rafiki, an AI workplace assistant for East African organizations. "
        "Generate a clear, structured meeting agenda. Be concise and practical. "
        "Format as a numbered list of agenda items with time estimates."
    )
    user_prompt = (
        f"Generate a meeting agenda for:\n"
        f"Title: {meeting.title}\n"
        f"Type: {meeting.meeting_type}\n"
        f"Duration: {meeting.duration_minutes} minutes\n"
        f"Description: {meeting.description or 'Not provided'}\n\n"
        f"Create a practical agenda with time allocations that adds up to {meeting.duration_minutes} minutes."
    )

    agenda_text = _openai_chat(system, user_prompt)
    meeting.agenda = agenda_text
    db.commit()

    return {"meeting_id": meeting_id, "agenda": agenda_text}


@router.post("/{meeting_id}/summary", response_model=SummaryResponse)
def generate_summary(
    meeting_id: uuid.UUID,
    data: SummaryRequest,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Generate meeting summary and extract action items using Claude."""
    meeting = db.query(Meeting).filter(
        Meeting.id == meeting_id, Meeting.org_id == org_id
    ).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    system = (
        "You are Rafiki, an AI workplace assistant. Analyze the meeting and produce: "
        "1) A concise summary (2-3 sentences). "
        "2) A list of clear, actionable action items. "
        "Respond in this exact JSON format: "
        '{"summary": "...", "action_items": ["item1", "item2", ...]}'
    )

    context = f"Meeting title: {meeting.title}\nType: {meeting.meeting_type}\nDuration: {meeting.duration_minutes} mins"
    if meeting.agenda:
        context += f"\nAgenda:\n{meeting.agenda}"
    if data.notes:
        context += f"\nNotes/Transcript:\n{data.notes}"

    raw = _openai_chat(system, context)

    # Parse JSON response
    import json
    try:
        clean = raw.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(clean)
        summary = parsed.get("summary", raw)
        action_items = parsed.get("action_items", [])
    except Exception:
        summary = raw
        action_items = []

    meeting.summary = summary
    meeting.action_items = action_items
    db.commit()

    return {"meeting_id": meeting_id, "summary": summary, "action_items": action_items}


@router.post("/{meeting_id}/wellbeing")
def log_wellbeing(
    meeting_id: uuid.UUID,
    data: WellbeingRequest,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Log a post-meeting wellbeing rating (1-5). Stored anonymously on the meeting."""
    if not 1 <= data.rating <= 5:
        raise HTTPException(400, "Rating must be between 1 and 5")
    meeting = db.query(Meeting).filter(
        Meeting.id == meeting_id, Meeting.org_id == org_id
    ).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    meeting.wellbeing_rating = data.rating
    db.commit()

    # Generate a supportive response from Rafiki
    if data.rating <= 2:
        system = "You are Rafiki, a compassionate workplace wellbeing assistant."
        prompt = (
            f"An employee rated their post-meeting wellbeing as {data.rating}/5 "
            f"(low). Their note: '{data.note or 'none'}'. "
            "Give a brief (2 sentences), warm, supportive message and suggest one small action."
        )
        message = _openai_chat(system, prompt)
    else:
        message = "Thanks for sharing how you're feeling. Keep up the great work! 🌟"

    return {"ok": True, "rating": data.rating, "message": message}


@router.post("/{meeting_id}/push-objectives")
def push_objectives(
    meeting_id: uuid.UUID,
    data: PushObjectivesRequest,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    """Push meeting action items as new objectives for the current user."""
    meeting = db.query(Meeting).filter(
        Meeting.id == meeting_id, Meeting.org_id == org_id
    ).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    from app.models.objective import Objective, KeyResult

    created = []
    for item in data.action_items:
        obj = Objective(
            org_id=org_id,
            user_id=user_id,
            title=item,
            description=f"Action item from meeting: {meeting.title}",
            target_date=data.target_date,
            status="draft",
        )
        db.add(obj)
        db.flush()
        kr = KeyResult(
            objective_id=obj.id,
            title="Complete action item",
            target_value=100,
            current_value=0,
            unit="%",
        )
        db.add(kr)
        created.append({"title": item, "objective_id": str(obj.id)})

    db.commit()
    return {"ok": True, "created": len(created), "objectives": created}


@router.post("/{meeting_id}/coaching-notes")
def save_coaching_notes(
    meeting_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    """For 1-on-1 meetings: auto-generate and save coaching notes via Claude."""
    meeting = db.query(Meeting).filter(
        Meeting.id == meeting_id, Meeting.org_id == org_id
    ).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    if meeting.meeting_type != "one_on_one":
        raise HTTPException(400, "Coaching notes only available for 1-on-1 meetings")
    if role not in _PRIVILEGED_ROLES and meeting.host_id != user_id:
        raise HTTPException(403, "Only the host can save coaching notes")

    system = (
        "You are Rafiki, an AI workplace coach assistant. "
        "Generate structured coaching session notes. Be professional and actionable."
    )
    context = f"1-on-1 meeting: {meeting.title}\nDuration: {meeting.duration_minutes} mins"
    if meeting.agenda:
        context += f"\nAgenda:\n{meeting.agenda}"
    if meeting.summary:
        context += f"\nSummary:\n{meeting.summary}"
    if meeting.action_items:
        context += f"\nAction items:\n" + "\n".join(f"- {a}" for a in meeting.action_items)

    notes = _openai_chat(system, f"Generate coaching session notes for:\n{context}")

    # Post to manager coaching endpoint internally
    try:
        from app.routers.manager import create_coaching_session
        # Store notes on meeting for reference
        meeting.summary = (meeting.summary or "") + f"\n\n--- Coaching Notes ---\n{notes}"
        db.commit()
    except Exception as e:
        logger.warning("Could not auto-post coaching session: %s", e)

    return {"ok": True, "notes": notes}


# ── Standard CRUD (after AI endpoints) ──

@router.get("/{meeting_id}", response_model=MeetingResponse)
def get_meeting(
    meeting_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    meeting = db.query(Meeting).filter(
        Meeting.id == meeting_id, Meeting.org_id == org_id
    ).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    is_participant = meeting.participant_ids and user_id in meeting.participant_ids
    if role not in _PRIVILEGED_ROLES and meeting.host_id != user_id and not is_participant:
        raise HTTPException(403, "Not authorized")
    return _to_response(meeting)


@router.put("/{meeting_id}", response_model=MeetingResponse)
def update_meeting(
    meeting_id: uuid.UUID,
    data: MeetingUpdate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    meeting = db.query(Meeting).filter(
        Meeting.id == meeting_id, Meeting.org_id == org_id
    ).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    if role not in _PRIVILEGED_ROLES and meeting.host_id != user_id:
        raise HTTPException(403, "Only the host can edit this meeting")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(meeting, field, value)
    db.commit()
    db.refresh(meeting)
    _sync_meeting_to_calendar(db, org_id, meeting)
    return _to_response(meeting)


@router.post("/{meeting_id}/start", response_model=MeetingResponse)
def start_meeting(
    meeting_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    meeting = db.query(Meeting).filter(
        Meeting.id == meeting_id, Meeting.org_id == org_id
    ).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    if meeting.host_id != user_id:
        raise HTTPException(403, "Only the host can start this meeting")
    meeting.started_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(meeting)
    return _to_response(meeting)


@router.post("/{meeting_id}/end", response_model=MeetingResponse)
def end_meeting(
    meeting_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    meeting = db.query(Meeting).filter(
        Meeting.id == meeting_id, Meeting.org_id == org_id
    ).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    if role not in _PRIVILEGED_ROLES and meeting.host_id != user_id:
        raise HTTPException(403, "Only the host can end this meeting")
    meeting.ended_at = datetime.now(timezone.utc)
    meeting.is_active = False
    db.commit()
    db.refresh(meeting)
    return _to_response(meeting)


@router.delete("/{meeting_id}")
def delete_meeting(
    meeting_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    meeting = db.query(Meeting).filter(
        Meeting.id == meeting_id, Meeting.org_id == org_id
    ).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    if role not in _PRIVILEGED_ROLES and meeting.host_id != user_id:
        raise HTTPException(403, "Only the host can delete this meeting")
    _remove_meeting_from_calendar(db, org_id, meeting_id)
    meeting.is_active = False
    db.commit()
    return {"ok": True, "message": "Meeting cancelled"}
