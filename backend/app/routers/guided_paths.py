from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.guided_paths import (
    ModuleCreate, ModuleUpdate, ModuleResponse, ModuleDetailResponse,
    ModuleStepResponse, SessionResponse, SessionStepResponse, AdvanceStepRequest,
    StartSessionRequest, OutcomeRequest, ModuleSuggestion, ModuleSuggestionsResponse,
)
from app.services.guided_paths import (
    list_modules, get_module, create_module, update_module, deactivate_module,
    start_session, get_session, get_module_step, advance_step, record_outcome,
)
from app.services.module_router import suggest_modules
from app.services.seed_modules import seed_canonical_modules
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/guided-paths", tags=["Guided Paths"])

DEMO_ORG_ID = 1
DEMO_USER_ID = 1


# ─── Module Listing (employee + admin) ───────────────────────────────

@router.get("/modules", response_model=list[ModuleResponse])
def get_modules(
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    modules = list_modules(db, DEMO_ORG_ID, active_only=active_only)
    return modules


@router.get("/modules/{module_id}", response_model=ModuleDetailResponse)
def get_module_detail(module_id: int, db: Session = Depends(get_db)):
    module = get_module(db, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    return ModuleDetailResponse(
        id=module.id,
        org_id=module.org_id,
        name=module.name,
        category=module.category,
        description=module.description,
        duration_minutes=module.duration_minutes,
        icon=module.icon,
        is_active=module.is_active,
        created_by=module.created_by,
        created_at=module.created_at,
        updated_at=module.updated_at,
        steps=module.steps,
        triggers=module.triggers,
        safety_checks=module.safety_checks,
    )


# ─── Module Suggestions ──────────────────────────────────────────────

@router.post("/suggest", response_model=ModuleSuggestionsResponse)
def suggest(
    theme: str | None = None,
    stress_band: str | None = None,
    available_time: int | None = None,
    db: Session = Depends(get_db),
):
    results = suggest_modules(db, DEMO_ORG_ID, theme=theme, stress_band=stress_band, available_time=available_time)
    suggestions = [ModuleSuggestion(**r) for r in results]
    return ModuleSuggestionsResponse(suggestions=suggestions, theme=theme)


# ─── Admin CRUD ──────────────────────────────────────────────────────

@router.post("/admin/modules", response_model=ModuleResponse)
def admin_create_module(payload: ModuleCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    # Convert step definitions to plain dicts for JSONB storage
    data["steps"] = [s.model_dump() if hasattr(s, "model_dump") else s for s in (payload.steps or [])]
    module = create_module(db, DEMO_ORG_ID, DEMO_USER_ID, data)
    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "create_module", "guided_module", module.id, {"name": module.name})
    return module


@router.put("/admin/modules/{module_id}", response_model=ModuleResponse)
def admin_update_module(module_id: int, payload: ModuleUpdate, db: Session = Depends(get_db)):
    module = get_module(db, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    if module.org_id is None:
        raise HTTPException(status_code=403, detail="Cannot edit global modules")
    data = payload.model_dump(exclude_unset=True)
    if "steps" in data and data["steps"] is not None:
        data["steps"] = [s.model_dump() if hasattr(s, "model_dump") else s for s in (payload.steps or [])]
    module = update_module(db, module, data)
    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "update_module", "guided_module", module.id, {"name": module.name})
    return module


@router.delete("/admin/modules/{module_id}")
def admin_delete_module(module_id: int, db: Session = Depends(get_db)):
    module = get_module(db, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    if module.org_id is None:
        raise HTTPException(status_code=403, detail="Cannot deactivate global modules")
    deactivate_module(db, module)
    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "deactivate_module", "guided_module", module.id, {"name": module.name})
    return {"ok": True, "message": "Module deactivated"}


# ─── Admin Seed ──────────────────────────────────────────────────────

@router.post("/admin/seed")
def admin_seed_modules(db: Session = Depends(get_db)):
    created = seed_canonical_modules(db)
    return {"ok": True, "created": created, "message": f"Seeded {len(created)} module(s)"}


# ─── Session (employee path runner) ──────────────────────────────────

@router.post("/modules/{module_id}/start", response_model=SessionStepResponse)
def start_module_session(
    module_id: int,
    payload: StartSessionRequest | None = None,
    db: Session = Depends(get_db),
):
    module = get_module(db, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    if not module.is_active:
        raise HTTPException(status_code=400, detail="Module is inactive")
    if not module.steps or len(module.steps) == 0:
        raise HTTPException(status_code=400, detail="Module has no steps")

    # Extract context vars from payload (or use defaults)
    role_key = payload.role_key if payload else None
    language = payload.language if payload else "en"
    stress_band = payload.stress_band if payload else None
    theme_category = payload.theme_category if payload else None
    available_time = payload.available_time if payload else None
    pre_rating = payload.pre_rating if payload else None

    session = start_session(
        db, DEMO_USER_ID, DEMO_ORG_ID, module_id, module,
        role_key=role_key,
        language=language,
        stress_band=stress_band,
        theme_category=theme_category,
        available_time=available_time,
        pre_rating=pre_rating,
    )
    step = get_module_step(session, module, 0)
    return SessionStepResponse(
        session_id=session.id,
        module_name=module.name,
        step=ModuleStepResponse(**step),
        status=session.status,
    )


@router.get("/sessions/{session_id}/step", response_model=SessionStepResponse)
def get_current_step(session_id: int, db: Session = Depends(get_db)):
    session = get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    module = get_module(db, session.module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    if session.status == "completed":
        raise HTTPException(status_code=400, detail="Session already completed")

    step = get_module_step(session, module, session.current_step)
    if not step:
        raise HTTPException(status_code=400, detail="No more steps")
    return SessionStepResponse(
        session_id=session.id,
        module_name=module.name,
        step=ModuleStepResponse(**step),
        status=session.status,
    )


@router.post("/sessions/{session_id}/advance", response_model=SessionStepResponse | dict)
def advance_session_step(session_id: int, payload: AdvanceStepRequest, db: Session = Depends(get_db)):
    session = get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "completed":
        raise HTTPException(status_code=400, detail="Session already completed")

    module = get_module(db, session.module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    result = advance_step(db, session, module, payload.response)

    if result["completed"]:
        return {"completed": True, "session_id": session.id, "message": "Module completed"}

    return SessionStepResponse(
        session_id=session.id,
        module_name=module.name,
        step=ModuleStepResponse(**result["step"]),
        status=result["session"].status,
    )


# ─── Outcome Recording ───────────────────────────────────────────────

@router.post("/sessions/{session_id}/outcome")
def record_session_outcome(session_id: int, payload: OutcomeRequest, db: Session = Depends(get_db)):
    session = get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session = record_outcome(db, session, payload.pre_rating, payload.post_rating)
    return {"ok": True, "pre_rating": session.pre_rating, "post_rating": session.post_rating}
