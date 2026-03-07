"""Guided Paths router — Sprint 4 extended with admin content editor + compliance export."""

import csv
import io
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.dependencies import get_current_org_id, get_current_user_id, get_current_role
from app.schemas.guided_paths import (
    ModuleCreate, ModuleUpdate, ModuleResponse, ModuleDetailResponse,
    ModuleStepResponse, SessionStepResponse, AdvanceStepRequest,
    StartSessionRequest, OutcomeRequest, ModuleSuggestion, ModuleSuggestionsResponse,
)
from app.services.guided_paths import (
    list_modules, get_module, create_module, update_module, deactivate_module,
    start_session, get_session, get_module_step, advance_step, record_outcome,
)
from app.services.module_router import suggest_modules
from app.services.seed_modules import seed_canonical_modules
from app.services.audit import log_action
from app.models.guided_paths import GuidedModule, GuidedPathSession
from app.models.module_completion import ModuleCompletion
from app.models.user import User

router = APIRouter(prefix="/api/v1/guided-paths", tags=["Guided Paths"])


# ─────────────────────────────────────────────────────────────────────
# Module Listing (employee + admin) — unchanged
# ─────────────────────────────────────────────────────────────────────

@router.get("/modules", response_model=list[ModuleResponse])
def get_modules(
    active_only: bool = Query(True),
    org_id: UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    return list_modules(db, org_id, active_only=active_only)


@router.get("/modules/{module_id}", response_model=ModuleDetailResponse)
def get_module_detail(
    module_id: int,
    org_id: UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
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


# ─────────────────────────────────────────────────────────────────────
# Module Suggestions — unchanged
# ─────────────────────────────────────────────────────────────────────

@router.post("/suggest", response_model=ModuleSuggestionsResponse)
def suggest(
    theme: str | None = None,
    stress_band: str | None = None,
    available_time: int | None = None,
    org_id: UUID = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    results = suggest_modules(db, org_id, theme=theme, stress_band=stress_band, available_time=available_time)
    return ModuleSuggestionsResponse(
        suggestions=[ModuleSuggestion(**r) for r in results],
        theme=theme,
    )


# ─────────────────────────────────────────────────────────────────────
# Admin CRUD — unchanged
# ─────────────────────────────────────────────────────────────────────

@router.post("/admin/modules", response_model=ModuleResponse)
def admin_create_module(
    payload: ModuleCreate,
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    data = payload.model_dump()
    data["steps"] = [
        s.model_dump() if hasattr(s, "model_dump") else s
        for s in (payload.steps or [])
    ]
    module = create_module(db, org_id, user_id, data)
    log_action(db, org_id, user_id, "create_module", "guided_module", str(module.id), {"name": module.name})
    return module


@router.put("/admin/modules/{module_id}", response_model=ModuleResponse)
def admin_update_module(
    module_id: int,
    payload: ModuleUpdate,
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    module = get_module(db, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    if module.org_id is None:
        raise HTTPException(status_code=403, detail="Cannot edit global modules")

    data = payload.model_dump(exclude_unset=True)
    if "steps" in data and data["steps"] is not None:
        data["steps"] = [
            s.model_dump() if hasattr(s, "model_dump") else s
            for s in (payload.steps or [])
        ]
    module = update_module(db, module, data)
    log_action(db, org_id, user_id, "update_module", "guided_module", str(module.id), {"name": module.name})
    return module


@router.delete("/admin/modules/{module_id}")
def admin_delete_module(
    module_id: int,
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    module = get_module(db, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    if module.org_id is None:
        raise HTTPException(status_code=403, detail="Cannot deactivate global modules")

    deactivate_module(db, module)
    log_action(db, org_id, user_id, "deactivate_module", "guided_module", str(module.id), {"name": module.name})
    return {"ok": True, "message": "Module deactivated"}


@router.post("/admin/seed")
def admin_seed_modules(db: Session = Depends(get_db)):
    created = seed_canonical_modules(db)
    return {"ok": True, "created": created, "message": f"Seeded {len(created)} module(s)"}


# ─────────────────────────────────────────────────────────────────────
# Sprint 4 — Admin: step reorder
# Steps live in guided_modules.steps JSONB array.
# Reorder = replace the whole steps array with client-supplied order.
# ─────────────────────────────────────────────────────────────────────

from pydantic import BaseModel
from typing import Any

class StepReorderRequest(BaseModel):
    steps: list[dict[str, Any]]  # Full ordered steps array from the editor


@router.put("/admin/modules/{module_id}/steps/reorder")
def admin_reorder_steps(
    module_id: int,
    payload: StepReorderRequest,
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    """Replace the steps JSONB array with a new client-supplied order.
    Called after drag-and-drop reorder in the HR admin editor."""
    if role not in ("hr_admin", "super_admin"):
        raise HTTPException(403, "HR admin only")

    module = get_module(db, module_id)
    if not module:
        raise HTTPException(404, "Module not found")
    if module.org_id is None:
        raise HTTPException(403, "Cannot edit global modules")

    # Re-index step_index values to match new order
    ordered = []
    for i, step in enumerate(payload.steps):
        step["step_index"] = i
        ordered.append(step)

    module = update_module(db, module, {"steps": ordered, "updated_at": datetime.utcnow()})
    log_action(db, org_id, user_id, "reorder_steps", "guided_module", str(module.id), {"step_count": len(ordered)})
    return {"ok": True, "step_count": len(ordered), "steps": module.steps}


# ─────────────────────────────────────────────────────────────────────
# Sprint 4 — Admin: completion stats per module
# ─────────────────────────────────────────────────────────────────────

@router.get("/admin/modules/{module_id}/completions")
def admin_module_completions(
    module_id: int,
    org_id: UUID = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    """List all completions for a module with employee names. HR admin only."""
    if role not in ("hr_admin", "super_admin"):
        raise HTTPException(403, "HR admin only")

    rows = (
        db.query(ModuleCompletion, User)
        .outerjoin(User, ModuleCompletion.user_id == User.user_id)
        .filter(
            ModuleCompletion.module_id == module_id,
            ModuleCompletion.org_id == org_id,
        )
        .order_by(ModuleCompletion.completed_at.desc().nullslast())
        .all()
    )

    module = get_module(db, module_id)
    total_steps = len(module.steps) if module and module.steps else 0

    return {
        "module_id": module_id,
        "module_name": module.name if module else None,
        "total_steps": total_steps,
        "completions": [
            {
                "completion_id": str(c.completion_id),
                "user_id": str(c.user_id),
                "employee_name": u.name if u else "Unknown",
                "employee_email": u.email if u else None,
                "started_at": c.started_at.isoformat() if c.started_at else None,
                "completed_at": c.completed_at.isoformat() if c.completed_at else None,
                "step_reached": c.step_reached,
                "pre_rating": c.pre_rating,
                "post_rating": c.post_rating,
                "passed": getattr(c, "passed", None),
                "exported_at": getattr(c, "exported_at", None),
            }
            for c, u in rows
        ],
    }


# ─────────────────────────────────────────────────────────────────────
# Sprint 4 — Admin: compliance CSV export
# ─────────────────────────────────────────────────────────────────────

@router.get("/admin/modules/{module_id}/completions/export")
def admin_export_completions(
    module_id: int,
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    """Download completions as CSV for compliance reporting."""
    if role not in ("hr_admin", "super_admin"):
        raise HTTPException(403, "HR admin only")

    module = get_module(db, module_id)
    if not module:
        raise HTTPException(404, "Module not found")

    rows = (
        db.query(ModuleCompletion, User)
        .outerjoin(User, ModuleCompletion.user_id == User.user_id)
        .filter(
            ModuleCompletion.module_id == module_id,
            ModuleCompletion.org_id == org_id,
        )
        .order_by(ModuleCompletion.completed_at.desc().nullslast())
        .all()
    )

    # Mark all exported rows
    now = datetime.utcnow()
    for c, _ in rows:
        if not getattr(c, "exported_at", None):
            c.exported_at = now
    db.commit()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Employee Name", "Email", "Module", "Started At",
        "Completed At", "Steps Reached", "Total Steps",
        "Pre Rating", "Post Rating", "Passed",
    ])

    total_steps = len(module.steps) if module.steps else 0

    for c, u in rows:
        writer.writerow([
            u.name if u else "",
            u.email if u else "",
            module.name,
            c.started_at.strftime("%Y-%m-%d %H:%M") if c.started_at else "",
            c.completed_at.strftime("%Y-%m-%d %H:%M") if c.completed_at else "Incomplete",
            c.step_reached or 0,
            total_steps,
            c.pre_rating or "",
            c.post_rating or "",
            "Yes" if getattr(c, "passed", None) else ("No" if getattr(c, "passed", None) is False else ""),
        ])

    output.seek(0)
    filename = f"{module.name.replace(' ', '_')}_completions_{now.strftime('%Y%m%d')}.csv"

    log_action(db, org_id, user_id, "export_completions", "guided_module", str(module_id), {"filename": filename})

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ─────────────────────────────────────────────────────────────────────
# Session endpoints — unchanged
# ─────────────────────────────────────────────────────────────────────

@router.post("/modules/{module_id}/start", response_model=SessionStepResponse)
def start_module_session(
    module_id: int,
    payload: StartSessionRequest | None = None,
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    module = get_module(db, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    if not module.is_active:
        raise HTTPException(status_code=400, detail="Module is inactive")
    if not module.steps:
        raise HTTPException(status_code=400, detail="Module has no steps")

    role_key = payload.role_key if payload else None
    language = payload.language if payload else "en"
    stress_band = payload.stress_band if payload else None
    theme_category = payload.theme_category if payload else None
    available_time = payload.available_time if payload else None
    pre_rating = payload.pre_rating if payload else None

    session = start_session(
        db, user_id, org_id, module_id, module,
        role_key=role_key, language=language, stress_band=stress_band,
        theme_category=theme_category, available_time=available_time, pre_rating=pre_rating,
    )
    step = get_module_step(session, module, 0)
    return SessionStepResponse(
        session_id=session.id,
        module_name=module.name,
        step=ModuleStepResponse(**step),
        status=session.status,
    )


@router.get("/sessions/{session_id}/step", response_model=SessionStepResponse)
def get_current_step(
    session_id: int,
    db: Session = Depends(get_db),
):
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
def advance_session_step(
    session_id: int,
    payload: AdvanceStepRequest,
    db: Session = Depends(get_db),
):
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


@router.post("/sessions/{session_id}/outcome")
def record_session_outcome(
    session_id: int,
    payload: OutcomeRequest,
    db: Session = Depends(get_db),
):
    session = get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session = record_outcome(db, session, payload.pre_rating, payload.post_rating)
    return {"ok": True, "pre_rating": session.pre_rating, "post_rating": session.post_rating}
