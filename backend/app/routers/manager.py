"""
Manager & Leadership Toolkit router.

Manager endpoints (require_manager): team view, coaching AI, toolkit browsing.
Admin endpoints (require_admin): manager config, toolkit management, audit trail.

WELLBEING FIREWALL: This router has ZERO access to conversations, guided paths,
crisis events, or stress ratings. That separation is architectural.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from app.database import get_db
from app.dependencies import (
    get_current_user_id, get_current_org_id,
    require_manager, require_admin,
)
from app.models.toolkit import ManagerConfig, ToolkitModule, CoachingSession
from app.models.performance import PerformanceEvaluation
from app.models.audit_log import AuditLog
from app.schemas.manager import (
    ManagerConfigCreate, ManagerConfigUpdate, ManagerConfigResponse,
    TeamMemberResponse,
    CoachingRequest, CoachingResponse, CoachingSessionResponse, CoachingOutcomeUpdate,
    ToolkitModuleCreate, ToolkitModuleUpdate, ToolkitModuleResponse,
    ManagerDashboardData,
)
from app.services.manager_scope import (
    get_manager_config, validate_employee_access, can_use_feature,
)
from app.services.toolkit_service import (
    list_modules, get_module, create_module, update_module, seed_default_modules,
)
from app.services.manager_ai import generate_coaching_plan
from app.services.audit import log_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/manager", tags=["Manager Toolkit"])


# ──────────────────────────────────────────────
# MANAGER ENDPOINTS (require manager or admin)
# ──────────────────────────────────────────────

@router.get("/team", response_model=list[TeamMemberResponse])
def get_team(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Get direct reports / team members for a manager.

    Currently returns mock team data — will resolve from OrgMember.reports_to
    when that model exists.
    """
    config = get_manager_config(db, user_id, org_id)
    if not config:
        raise HTTPException(status_code=403, detail="No active manager configuration found")

    # For now, return employees with evaluations in this org as proxy team members
    # In production, this resolves through OrgMember.reports_to
    eval_users = (
        db.query(
            PerformanceEvaluation.user_id,
            sa_func.max(PerformanceEvaluation.overall_rating).label("last_rating"),
            sa_func.count(PerformanceEvaluation.id).label("eval_count"),
        )
        .filter(
            PerformanceEvaluation.org_id == org_id,
            PerformanceEvaluation.user_id != user_id,  # exclude self
        )
        .group_by(PerformanceEvaluation.user_id)
        .all()
    )

    team = []
    for row in eval_users:
        team.append(TeamMemberResponse(
            user_id=row.user_id,
            name=f"Employee #{row.user_id}",  # Placeholder until User model exists
            job_title=None,
            department=None,
            objectives_count=0,
            last_evaluation_rating=row.last_rating,
        ))

    log_action(db, org_id, user_id, "view", "manager_team", details={"team_size": len(team)})
    return team


@router.get("/team/{member_id}/profile", response_model=TeamMemberResponse)
def get_team_member_profile(
    member_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Get scoped employee profile — performance data only, NEVER wellbeing."""
    if not validate_employee_access(db, user_id, member_id, org_id):
        raise HTTPException(status_code=403, detail="Access denied for this employee")

    latest_eval = (
        db.query(PerformanceEvaluation)
        .filter(
            PerformanceEvaluation.user_id == member_id,
            PerformanceEvaluation.org_id == org_id,
        )
        .order_by(PerformanceEvaluation.created_at.desc())
        .first()
    )

    log_action(db, org_id, user_id, "view", "employee_profile", member_id)
    return TeamMemberResponse(
        user_id=member_id,
        name=f"Employee #{member_id}",
        last_evaluation_rating=latest_eval.overall_rating if latest_eval else None,
    )


@router.get("/team/{member_id}/evaluations", response_model=list)
def get_team_member_evaluations(
    member_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Get performance evaluations for a team member."""
    if not validate_employee_access(db, user_id, member_id, org_id):
        raise HTTPException(status_code=403, detail="Access denied for this employee")

    evaluations = (
        db.query(PerformanceEvaluation)
        .filter(
            PerformanceEvaluation.user_id == member_id,
            PerformanceEvaluation.org_id == org_id,
        )
        .order_by(PerformanceEvaluation.created_at.desc())
        .all()
    )

    log_action(db, org_id, user_id, "view", "employee_evaluations", member_id)
    return [
        {
            "id": ev.id,
            "evaluation_period": ev.evaluation_period,
            "overall_rating": ev.overall_rating,
            "strengths": ev.strengths,
            "areas_for_improvement": ev.areas_for_improvement,
            "goals_for_next_period": ev.goals_for_next_period,
            "comments": ev.comments,
            "created_at": ev.created_at.isoformat() if ev.created_at else None,
        }
        for ev in evaluations
    ]


# --- Coaching AI ---

@router.post("/coaching", response_model=CoachingResponse)
def create_coaching_session(
    data: CoachingRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Generate an AI coaching plan from performance data only."""
    if not validate_employee_access(db, user_id, data.employee_member_id, org_id):
        raise HTTPException(status_code=403, detail="Access denied for this employee")

    if not can_use_feature(db, user_id, org_id, "coaching_ai"):
        raise HTTPException(status_code=403, detail="Coaching AI feature not enabled for your role")

    result = generate_coaching_plan(
        db=db,
        manager_id=user_id,
        employee_user_id=data.employee_member_id,
        org_id=org_id,
        concern=data.concern,
        employee_name=f"Employee #{data.employee_member_id}",
    )

    log_action(
        db, org_id, user_id, "generate", "coaching_session", result["session_id"],
        details={"employee_id": data.employee_member_id},
    )

    return CoachingResponse(**result)


@router.put("/coaching/{session_id}/outcome")
def update_coaching_outcome(
    session_id: int,
    data: CoachingOutcomeUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Log the outcome of a coaching conversation."""
    session = (
        db.query(CoachingSession)
        .filter(
            CoachingSession.id == session_id,
            CoachingSession.manager_id == user_id,
            CoachingSession.org_id == org_id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Coaching session not found")

    if data.outcome not in ("improved", "same", "worse"):
        raise HTTPException(status_code=400, detail="Outcome must be: improved, same, or worse")

    session.outcome_logged = data.outcome
    db.commit()

    log_action(db, org_id, user_id, "update_outcome", "coaching_session", session_id,
               details={"outcome": data.outcome})
    return {"ok": True, "session_id": session_id, "outcome": data.outcome}


@router.get("/coaching/history", response_model=list[CoachingSessionResponse])
def get_coaching_history(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Get past coaching sessions for the current manager."""
    sessions = (
        db.query(CoachingSession)
        .filter(
            CoachingSession.manager_id == user_id,
            CoachingSession.org_id == org_id,
        )
        .order_by(CoachingSession.created_at.desc())
        .limit(50)
        .all()
    )
    return sessions


# --- Toolkit ---

@router.get("/toolkit", response_model=list[ToolkitModuleResponse])
def get_toolkit_modules(
    category: str | None = Query(default=None),
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Get available toolkit modules (org-specific + platform defaults)."""
    return list_modules(db, org_id, category=category)


@router.get("/toolkit/{module_id}", response_model=ToolkitModuleResponse)
def get_toolkit_module(
    module_id: int,
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Get a specific toolkit module."""
    module = get_module(db, module_id, org_id)
    if not module:
        raise HTTPException(status_code=404, detail="Toolkit module not found")
    return module


# --- Dashboard ---

@router.get("/dashboard", response_model=ManagerDashboardData)
def get_dashboard(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Get aggregated manager dashboard data."""
    config = get_manager_config(db, user_id, org_id)
    if not config:
        return ManagerDashboardData()

    # Team size (employees with evaluations in org, excluding self)
    team_count = (
        db.query(sa_func.count(sa_func.distinct(PerformanceEvaluation.user_id)))
        .filter(
            PerformanceEvaluation.org_id == org_id,
            PerformanceEvaluation.user_id != user_id,
        )
        .scalar() or 0
    )

    # Average performance rating
    avg_rating = (
        db.query(sa_func.avg(PerformanceEvaluation.overall_rating))
        .filter(
            PerformanceEvaluation.org_id == org_id,
            PerformanceEvaluation.user_id != user_id,
        )
        .scalar() or 0.0
    )

    # Coaching sessions count
    coaching_count = (
        db.query(sa_func.count(CoachingSession.id))
        .filter(
            CoachingSession.manager_id == user_id,
            CoachingSession.org_id == org_id,
        )
        .scalar() or 0
    )

    # Recent coaching sessions
    recent = (
        db.query(CoachingSession)
        .filter(
            CoachingSession.manager_id == user_id,
            CoachingSession.org_id == org_id,
        )
        .order_by(CoachingSession.created_at.desc())
        .limit(5)
        .all()
    )

    return ManagerDashboardData(
        team_size=team_count,
        avg_performance_rating=round(float(avg_rating), 1),
        coaching_sessions_count=coaching_count,
        recent_sessions=recent,
    )


# ──────────────────────────────────────────────
# ADMIN ENDPOINTS (require HR admin)
# ──────────────────────────────────────────────

@router.get("/admin/configs", response_model=list[ManagerConfigResponse])
def list_manager_configs(
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """List all manager configurations for the org."""
    return (
        db.query(ManagerConfig)
        .filter(ManagerConfig.org_id == org_id)
        .order_by(ManagerConfig.created_at.desc())
        .all()
    )


@router.post("/admin/configs", response_model=ManagerConfigResponse)
def create_manager_config(
    data: ManagerConfigCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """Assign manager role + scope to a user."""
    # Check if config already exists for this user
    existing = (
        db.query(ManagerConfig)
        .filter(ManagerConfig.user_id == data.user_id, ManagerConfig.org_id == org_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Manager config already exists for this user")

    # Self-assignment prevention
    if data.user_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot assign yourself as a manager through this endpoint")

    config = ManagerConfig(
        user_id=data.user_id,
        org_id=org_id,
        org_member_id=data.org_member_id,
        manager_level=data.manager_level,
        allowed_data_types=data.allowed_data_types,
        allowed_features=data.allowed_features,
        department_scope=data.department_scope,
    )
    db.add(config)
    db.commit()
    db.refresh(config)

    log_action(db, org_id, user_id, "create", "manager_config", config.id,
               details={"target_user": data.user_id, "level": data.manager_level})
    return config


@router.put("/admin/configs/{config_id}", response_model=ManagerConfigResponse)
def update_manager_config(
    config_id: int,
    data: ManagerConfigUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """Update manager scope/permissions."""
    config = (
        db.query(ManagerConfig)
        .filter(ManagerConfig.id == config_id, ManagerConfig.org_id == org_id)
        .first()
    )
    if not config:
        raise HTTPException(status_code=404, detail="Manager config not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(config, field, value)

    db.commit()
    db.refresh(config)

    log_action(db, org_id, user_id, "update", "manager_config", config_id,
               details=data.model_dump(exclude_unset=True))
    return config


@router.delete("/admin/configs/{config_id}")
def delete_manager_config(
    config_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """Revoke manager access."""
    config = (
        db.query(ManagerConfig)
        .filter(ManagerConfig.id == config_id, ManagerConfig.org_id == org_id)
        .first()
    )
    if not config:
        raise HTTPException(status_code=404, detail="Manager config not found")

    target_user = config.user_id
    db.delete(config)
    db.commit()

    log_action(db, org_id, user_id, "delete", "manager_config", config_id,
               details={"revoked_user": target_user})
    return {"ok": True, "message": "Manager access revoked"}


# --- Admin Toolkit Management ---

@router.get("/admin/toolkit", response_model=list[ToolkitModuleResponse])
def admin_list_toolkit(
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """List all toolkit modules for the org (including inactive)."""
    return list_modules(db, org_id, active_only=False)


@router.post("/admin/toolkit", response_model=ToolkitModuleResponse)
def admin_create_toolkit_module(
    data: ToolkitModuleCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """Create or customize a toolkit module for the org."""
    module = create_module(db, org_id, data.model_dump(), created_by=user_id)

    log_action(db, org_id, user_id, "create", "toolkit_module", module.id,
               details={"title": data.title, "category": data.category})
    return module


@router.put("/admin/toolkit/{module_id}", response_model=ToolkitModuleResponse)
def admin_update_toolkit_module(
    module_id: int,
    data: ToolkitModuleUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """Edit a toolkit module (org-owned only, not platform defaults)."""
    module = (
        db.query(ToolkitModule)
        .filter(ToolkitModule.id == module_id, ToolkitModule.org_id == org_id)
        .first()
    )
    if not module:
        raise HTTPException(status_code=404, detail="Toolkit module not found (or is a platform default)")

    module = update_module(db, module, data.model_dump(exclude_unset=True))

    log_action(db, org_id, user_id, "update", "toolkit_module", module_id,
               details=data.model_dump(exclude_unset=True))
    return module


# --- Admin Audit ---

@router.get("/admin/audit")
def get_manager_audit_trail(
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """View manager activity audit trail."""
    entries = (
        db.query(AuditLog)
        .filter(
            AuditLog.org_id == org_id,
            AuditLog.resource_type.in_([
                "manager_team", "employee_profile", "employee_evaluations",
                "coaching_session", "manager_config", "toolkit_module",
            ]),
        )
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": e.id,
            "user_id": e.user_id,
            "action": e.action,
            "resource_type": e.resource_type,
            "resource_id": e.resource_id,
            "details": e.details,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]


# --- Seed endpoint (admin utility) ---

@router.post("/admin/seed-toolkit")
def seed_toolkit(
    db: Session = Depends(get_db),
    _role: str = Depends(require_admin),
):
    """Seed default platform toolkit modules."""
    count = seed_default_modules(db)
    return {"ok": True, "modules_created": count}
