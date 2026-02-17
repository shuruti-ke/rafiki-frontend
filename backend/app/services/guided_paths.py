import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.guided_path import GuidedModule, GuidedPathSession
from app.services.context_pack import build_context_pack
from app.services.module_composer import compose_module

logger = logging.getLogger(__name__)


def list_modules(db: Session, org_id: int, active_only: bool = True):
    q = db.query(GuidedModule).filter(
        (GuidedModule.org_id == org_id) | (GuidedModule.org_id.is_(None))
    )
    if active_only:
        q = q.filter(GuidedModule.is_active == True)
    return q.order_by(GuidedModule.created_at.desc()).all()


def get_module(db: Session, module_id: int):
    return db.query(GuidedModule).filter(GuidedModule.id == module_id).first()


def create_module(db: Session, org_id: int, created_by: int, data: dict):
    module = GuidedModule(
        org_id=org_id,
        name=data["name"],
        category=data["category"],
        description=data.get("description"),
        duration_minutes=data.get("duration_minutes", 10),
        icon=data.get("icon", "brain"),
        steps=data.get("steps", []),
        triggers=data.get("triggers", []),
        safety_checks=data.get("safety_checks", []),
        created_by=created_by,
    )
    db.add(module)
    db.commit()
    db.refresh(module)
    return module


def update_module(db: Session, module: GuidedModule, data: dict):
    for key, value in data.items():
        if value is not None:
            setattr(module, key, value)
    db.commit()
    db.refresh(module)
    return module


def deactivate_module(db: Session, module: GuidedModule):
    module.is_active = False
    db.commit()
    db.refresh(module)
    return module


def start_session(
    db: Session,
    user_id: int,
    org_id: int,
    module_id: int,
    module: GuidedModule,
    role_key: str | None = None,
    language: str | None = "en",
    stress_band: str | None = None,
    theme_category: str | None = None,
    available_time: int | None = None,
    pre_rating: int | None = None,
):
    """Start a session with adaptive composition.

    Builds a context pack, calls the LLM composer to adapt steps,
    and caches the composed steps on the session.
    """
    # Build context pack
    session_vars = {
        "language": language or "en",
        "stress_band": stress_band,
        "theme_category": theme_category,
        "available_time": available_time,
    }
    context_pack = build_context_pack(db, org_id, role_key=role_key, session_vars=session_vars)

    # Compose adapted steps via LLM (falls back to raw blueprint on failure)
    blueprint_steps = module.steps or []
    composed_steps = compose_module(blueprint_steps, context_pack, module.name)

    session = GuidedPathSession(
        user_id=user_id,
        org_id=org_id,
        module_id=module_id,
        current_step=0,
        status="in_progress",
        responses=[],
        composed_steps=composed_steps,
        context_pack=context_pack,
        pre_rating=pre_rating,
        theme_category=theme_category,
        available_time=available_time,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session(db: Session, session_id: int):
    return db.query(GuidedPathSession).filter(GuidedPathSession.id == session_id).first()


def _get_session_steps(session: GuidedPathSession, module: GuidedModule) -> list[dict]:
    """Get the effective steps for a session — composed if available, else raw blueprint."""
    return session.composed_steps or module.steps or []


def get_module_step(session: GuidedPathSession, module: GuidedModule, step_index: int):
    """Get a step from the session's composed steps (or raw blueprint fallback)."""
    steps = _get_session_steps(session, module)
    if step_index < 0 or step_index >= len(steps):
        return None
    step = steps[step_index]
    return {
        "step_index": step_index,
        "total_steps": len(steps),
        "type": step.get("type", "prompt"),
        "message": step.get("message", ""),
        "expected_input": step.get("expected_input"),
        "safety_check": step.get("safety_check", False),
        "media_url": step.get("media_url"),
    }


def advance_step(db: Session, session: GuidedPathSession, module: GuidedModule, user_response: str | None = None):
    responses = list(session.responses or [])
    responses.append({
        "step": session.current_step,
        "response": user_response,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    session.responses = responses

    next_index = session.current_step + 1
    steps = _get_session_steps(session, module)

    if next_index >= len(steps):
        session.status = "completed"
        session.completed_at = datetime.now(timezone.utc)
        session.current_step = next_index
        db.commit()
        db.refresh(session)
        return {"completed": True, "session": session}

    session.current_step = next_index
    db.commit()
    db.refresh(session)

    step = steps[next_index]
    return {
        "completed": False,
        "session": session,
        "step": {
            "step_index": next_index,
            "total_steps": len(steps),
            "type": step.get("type", "prompt"),
            "message": step.get("message", ""),
            "expected_input": step.get("expected_input"),
            "safety_check": step.get("safety_check", False),
            "media_url": step.get("media_url"),
        },
    }


def record_outcome(db: Session, session: GuidedPathSession, pre_rating: int | None, post_rating: int | None):
    """Record pre/post outcome ratings on a session."""
    if pre_rating is not None:
        session.pre_rating = pre_rating
    if post_rating is not None:
        session.post_rating = post_rating
    db.commit()
    db.refresh(session)
    return session
