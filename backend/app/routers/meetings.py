# backend/app/routers/meetings.py
import logging
import uuid
import os
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.dependencies import get_current_org_id, get_current_user_id, get_current_role
from app.models.meeting import Meeting, _generate_room_name
from app.models.user import User
from app.schemas.meetings import MeetingCreate, MeetingUpdate, MeetingResponse

logger = logging.getLogger(__name__)

# ── Jaas config ──
JAAS_APP_ID = os.getenv("JAAS_APP_ID", "").strip()
JAAS_API_KEY_ID = os.getenv("JAAS_API_KEY_ID", "").strip()
JAAS_PRIVATE_KEY = os.getenv("JAAS_PRIVATE_KEY", "").strip().replace("\\n", "\n")

JITSI_BASE_URL = f"https://8x8.vc/{JAAS_APP_ID}" if JAAS_APP_ID else "https://meet.jit.si"

router = APIRouter(prefix="/api/v1/meetings", tags=["Meetings"])

_PRIVILEGED_ROLES = {"hr_admin", "super_admin"}


def _build_jitsi_url(room_name: str) -> str:
    return f"{JITSI_BASE_URL}/{room_name}"


def _generate_jaas_token(user_id, user_name, user_email, room_name, is_moderator=False):
    if not JAAS_APP_ID or not JAAS_API_KEY_ID or not JAAS_PRIVATE_KEY:
        return None
    try:
        import jwt
        now = int(time.time())
        payload = {
            "iss": "chat",
            "aud": "jitsi",
            "iat": now,
            "exp": now + 7200,
            "nbf": now - 10,
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
        headers = {"kid": JAAS_API_KEY_ID, "alg": "RS256"}
        return jwt.encode(payload, JAAS_PRIVATE_KEY, algorithm="RS256", headers=headers)
    except Exception as e:
        logger.error("Failed to generate Jaas JWT: %s", e)
        return None


def _to_response(meeting: Meeting) -> dict:
    d = {c.name: getattr(meeting, c.name) for c in meeting.__table__.columns}
    d["jitsi_url"] = _build_jitsi_url(meeting.room_name)
    return d


@router.post("", response_model=MeetingResponse)
def create_meeting(
    data: MeetingCreate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    room = _generate_room_name()
    meeting = Meeting(
        org_id=org_id,
        host_id=user_id,
        title=data.title,
        description=data.description,
        room_name=room,
        scheduled_at=data.scheduled_at,
        duration_minutes=data.duration_minutes,
        participant_ids=data.participant_ids or [],
        meeting_type=data.meeting_type,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
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
        if m.host_id == user_id
        or (m.participant_ids and user_id in m.participant_ids)
    ]
    return [_to_response(m) for m in visible]


@router.get("/all", response_model=list[MeetingResponse])
def list_all_meetings(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
):
    if role not in _PRIVILEGED_ROLES:
        raise HTTPException(status_code=403, detail="Admin only")
    meetings = (
        db.query(Meeting)
        .filter(Meeting.org_id == org_id, Meeting.is_active == True)
        .order_by(Meeting.scheduled_at.desc().nullslast(), Meeting.created_at.desc())
        .all()
    )
    return [_to_response(m) for m in meetings]


# ── /token must be defined BEFORE /{meeting_id} to avoid route conflict ──
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
        raise HTTPException(status_code=404, detail="Meeting not found")

    is_participant = meeting.participant_ids and user_id in meeting.participant_ids
    if role not in _PRIVILEGED_ROLES and meeting.host_id != user_id and not is_participant:
        raise HTTPException(status_code=403, detail="Not authorized to join this meeting")

    user = db.query(User).filter(User.user_id == user_id).first()
    user_name = getattr(user, "name", None) or "Rafiki User"
    user_email = getattr(user, "email", None) or ""
    is_moderator = meeting.host_id == user_id or role in _PRIVILEGED_ROLES

    token = _generate_jaas_token(
        user_id=user_id,
        user_name=user_name,
        user_email=user_email,
        room_name=meeting.room_name,
        is_moderator=is_moderator,
    )

    return {
        "token": token,
        "room_name": meeting.room_name,
        "jitsi_url": _build_jitsi_url(meeting.room_name),
        "app_id": JAAS_APP_ID,
        "is_moderator": is_moderator,
        "jaas_configured": bool(token),
    }


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
        raise HTTPException(status_code=404, detail="Meeting not found")

    is_participant = meeting.participant_ids and user_id in meeting.participant_ids
    if role not in _PRIVILEGED_ROLES and meeting.host_id != user_id and not is_participant:
        raise HTTPException(status_code=403, detail="Not authorized")

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
        raise HTTPException(status_code=404, detail="Meeting not found")
    if role not in _PRIVILEGED_ROLES and meeting.host_id != user_id:
        raise HTTPException(status_code=403, detail="Only the host can edit this meeting")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(meeting, field, value)

    db.commit()
    db.refresh(meeting)
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
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.host_id != user_id:
        raise HTTPException(status_code=403, detail="Only the host can start this meeting")

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
        raise HTTPException(status_code=404, detail="Meeting not found")
    if role not in _PRIVILEGED_ROLES and meeting.host_id != user_id:
        raise HTTPException(status_code=403, detail="Only the host can end this meeting")

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
        raise HTTPException(status_code=404, detail="Meeting not found")
    if role not in _PRIVILEGED_ROLES and meeting.host_id != user_id:
        raise HTTPException(status_code=403, detail="Only the host can delete this meeting")

    meeting.is_active = False
    db.commit()
    return {"ok": True, "message": "Meeting cancelled"}
