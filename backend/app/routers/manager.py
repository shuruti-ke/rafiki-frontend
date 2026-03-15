"""
Manager & Leadership Toolkit router.

Manager endpoints (require_manager): team view, coaching AI, toolkit browsing.
Admin endpoints (require_admin): manager config, toolkit management, audit trail.

WELLBEING FIREWALL: This router has ZERO access to conversations, guided paths,
crisis events, or stress ratings. That separation is architectural.
"""

import logging
import uuid
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
    ToolkitGenerateRequest, ToolkitGeneratedItem,
    ManagerDashboardData,
)
from app.services.manager_scope import (
    get_manager_config, validate_employee_access, can_use_feature,
)
from app.services.toolkit_service import (
    list_modules, get_module, create_module, update_module, seed_default_modules,
)
from app.services.toolkit_ai import generate_toolkit_with_ai
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
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Get direct reports / team members for a manager."""
    from app.models.user import User
    from app.models.objective import Objective

    is_elevated = _role in ("super_admin", "hr_admin")

    config = get_manager_config(db, user_id, org_id)
    # Manager with direct reports can use toolkits even without a ManagerConfig row
    is_manager = _role and str(_role).strip().lower() == "manager"
    if not config and not is_elevated and not is_manager:
        raise HTTPException(status_code=403, detail="No active manager configuration found")

    # super_admin: all users platform-wide
    # hr_admin: all active users in their org (must have name or email)
    if _role == "super_admin":
        direct_reports = (
            db.query(User)
            .filter(
                User.user_id != user_id,
                User.is_active == True,
            )
            .all()
        )
    elif _role == "hr_admin":
        direct_reports = (
            db.query(User)
            .filter(
                User.user_id != user_id,
                User.org_id == org_id,
                User.is_active == True,
                (User.name.isnot(None)) | (User.email.isnot(None)),
            )
            .all()
        )
    else:
        # Primary: employees whose manager_id points to this manager
        direct_reports = (
            db.query(User)
            .filter(
                User.manager_id == user_id,
                User.org_id == org_id,
                User.is_active == True,
            )
            .all()
        )

        # Fallback: if no direct reports via manager_id, check department scope (requires config)
        if not direct_reports and config and getattr(config, "department_scope", None):
            direct_reports = (
                db.query(User)
                .filter(
                    User.org_id == org_id,
                    User.department.in_(config.department_scope),
                    User.user_id != user_id,
                    User.is_active == True,
                )
                .all()
            )

    # Build user_id list for batch queries
    member_ids = [u.user_id for u in direct_reports]

    # Batch-load latest evaluation ratings
    eval_map = {}
    if member_ids:
        eval_rows = (
            db.query(
                PerformanceEvaluation.user_id,
                sa_func.max(PerformanceEvaluation.overall_rating).label("last_rating"),
            )
            .filter(
                PerformanceEvaluation.org_id == org_id,
                PerformanceEvaluation.user_id.in_(member_ids),
            )
            .group_by(PerformanceEvaluation.user_id)
            .all()
        )
        eval_map = {row.user_id: row.last_rating for row in eval_rows}

    # Batch-load objective counts
    obj_map = {}
    if member_ids:
        obj_rows = (
            db.query(
                Objective.user_id,
                sa_func.count(Objective.id).label("obj_count"),
            )
            .filter(
                Objective.user_id.in_(member_ids),
                Objective.status.in_(["active", "pending_review", "draft"]),
            )
            .group_by(Objective.user_id)
            .all()
        )
        obj_map = {row.user_id: row.obj_count for row in obj_rows}

    team = []
    for u in direct_reports:
        team.append(TeamMemberResponse(
            user_id=u.user_id,
            name=u.name or u.email or f"Employee #{u.user_id}",
            email=u.email,
            job_title=u.job_title,
            department=u.department,
            objectives_count=obj_map.get(u.user_id, 0),
            last_evaluation_rating=eval_map.get(u.user_id),
        ))

    log_action(db, org_id, user_id, "view", "manager_team", details={"team_size": len(team)})
    return team


@router.get("/team/{member_id}/profile", response_model=TeamMemberResponse)
def get_team_member_profile(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
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

    from app.models.user import User
    user = db.query(User).filter(User.user_id == member_id).first()

    log_action(db, org_id, user_id, "view", "employee_profile", member_id)
    return TeamMemberResponse(
        user_id=member_id,
        name=user.name if user else f"Employee #{member_id}",
        email=user.email if user else None,
        job_title=user.job_title if user else None,
        department=user.department if user else None,
        last_evaluation_rating=latest_eval.overall_rating if latest_eval else None,
    )


@router.get("/team/{member_id}/evaluations", response_model=list)
def get_team_member_evaluations(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
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
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Generate an AI coaching plan from performance data only."""
    from app.models.user import User

    if not validate_employee_access(db, user_id, data.employee_member_id, org_id):
        # Fallback: if employee is in same org and user passed require_manager, allow
        emp = db.query(User).filter(User.user_id == data.employee_member_id).first()
        if not emp or (emp.org_id is not None and emp.org_id != org_id):
            raise HTTPException(status_code=403, detail="Access denied for this employee")

    if not can_use_feature(db, user_id, org_id, "coaching_ai"):
        raise HTTPException(status_code=403, detail="Coaching AI feature not enabled for your role")

    emp = db.query(User).filter(User.user_id == data.employee_member_id).first()
    emp_name = emp.name if emp else f"Employee #{data.employee_member_id}"

    result = generate_coaching_plan(
        db=db,
        manager_id=user_id,
        employee_user_id=data.employee_member_id,
        org_id=org_id,
        concern=data.concern,
        employee_name=emp_name,
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
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
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
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
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
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Get available toolkit modules (org-specific + platform defaults)."""
    return list_modules(db, org_id, category=category)


@router.get("/toolkit/{module_id}", response_model=ToolkitModuleResponse)
def get_toolkit_module(
    module_id: int,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Get a specific toolkit module."""
    module = get_module(db, module_id, org_id)
    if not module:
        raise HTTPException(status_code=404, detail="Toolkit module not found")
    return module


@router.post("/toolkit/generate")
def generate_toolkit(
    data: ToolkitGenerateRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Generate a toolkit module with AI from a prompt, or save a pre-generated one."""
    if not can_use_feature(db, user_id, org_id, "toolkit"):
        raise HTTPException(status_code=403, detail="Toolkit feature not enabled for your role")

    if data.save and data.generated:
        g = data.generated
        if not isinstance(g, dict) or not g.get("title") or not g.get("category"):
            raise HTTPException(status_code=400, detail="generated must include title, category, and content")
        module = create_module(
            db,
            org_id,
            {
                "title": g["title"],
                "category": g["category"],
                "content": g.get("content", {}),
                "language": "en",
            },
            created_by=user_id,
        )
        log_action(db, org_id, user_id, "create", "toolkit_module", module.id,
                   details={"title": module.title, "category": module.category, "ai_generated": True})
        return {"saved": True, "module": module, "generated": ToolkitGeneratedItem(**g)}

    prompt = (data.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required to generate")

    generated = generate_toolkit_with_ai(prompt, data.category)
    if not generated:
        raise HTTPException(
            status_code=503,
            detail="Toolkit generation is unavailable. Check AI configuration or try again.",
        )

    if data.save:
        module = create_module(
            db,
            org_id,
            {
                "title": generated["title"],
                "category": generated["category"],
                "content": generated["content"],
                "language": "en",
            },
            created_by=user_id,
        )
        log_action(db, org_id, user_id, "create", "toolkit_module", module.id,
                   details={"title": module.title, "category": module.category, "ai_generated": True})
        return {"saved": True, "module": module, "generated": ToolkitGeneratedItem(**generated)}

    return {"saved": False, "generated": ToolkitGeneratedItem(**generated)}


# --- Dashboard ---

@router.get("/dashboard", response_model=ManagerDashboardData)
def get_dashboard(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_manager),
):
    """Get aggregated manager dashboard data."""
    config = get_manager_config(db, user_id, org_id)
    if not config:
        return ManagerDashboardData()

    from app.models.user import User

    is_super = _role == "super_admin"

    if is_super:
        # super_admin sees all users across all orgs
        team_count = (
            db.query(sa_func.count(User.user_id))
            .filter(User.user_id != user_id, User.is_active == True)
            .scalar() or 0
        )
        member_ids = [
            uid for (uid,) in
            db.query(User.user_id).filter(
                User.user_id != user_id, User.is_active == True,
            ).all()
        ]
    else:
        # Team size — direct reports via manager_id
        team_count = (
            db.query(sa_func.count(User.user_id))
            .filter(
                User.manager_id == user_id,
                User.org_id == org_id,
                User.is_active == True,
            )
            .scalar() or 0
        )

        # Fallback to department scope if no direct reports
        if team_count == 0 and config.department_scope:
            team_count = (
                db.query(sa_func.count(User.user_id))
                .filter(
                    User.org_id == org_id,
                    User.department.in_(config.department_scope),
                    User.user_id != user_id,
                    User.is_active == True,
                )
                .scalar() or 0
            )

        # Get direct report IDs for evaluation query
        member_ids = [
            uid for (uid,) in
            db.query(User.user_id).filter(
                User.manager_id == user_id,
                User.org_id == org_id,
                User.is_active == True,
            ).all()
        ]

    # Average performance rating for team members
    avg_query = db.query(sa_func.avg(PerformanceEvaluation.overall_rating)).filter(
        PerformanceEvaluation.org_id == org_id,
    )
    if member_ids:
        avg_query = avg_query.filter(PerformanceEvaluation.user_id.in_(member_ids))
    else:
        avg_query = avg_query.filter(PerformanceEvaluation.user_id != user_id)
    avg_rating = avg_query.scalar() or 0.0

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

    # Timesheet status for direct reports (current week)
    timesheet_status = []
    if member_ids:
        from datetime import datetime as _dt, timedelta as _td
        from app.models.timesheet import TimesheetEntry
        today = _dt.utcnow().date()
        week_start = today - _td(days=today.weekday())
        week_end = week_start + _td(days=6)

        ts_rows = (
            db.query(TimesheetEntry.user_id, sa_func.sum(TimesheetEntry.hours))
            .filter(
                TimesheetEntry.org_id == org_id,
                TimesheetEntry.user_id.in_(member_ids),
                TimesheetEntry.date >= week_start,
                TimesheetEntry.date <= week_end,
                TimesheetEntry.status.in_(["submitted", "approved"]),
            )
            .group_by(TimesheetEntry.user_id)
            .all()
        )
        ts_map = {row[0]: float(row[1] or 0) for row in ts_rows}

        members = db.query(User).filter(User.user_id.in_(member_ids)).all()
        for m in members:
            timesheet_status.append({
                "user_id": str(m.user_id),
                "name": m.name or m.email or f"Employee #{m.user_id}",
                "submitted": m.user_id in ts_map,
                "hours": round(ts_map.get(m.user_id, 0), 1),
            })

    return ManagerDashboardData(
        team_size=team_count,
        avg_performance_rating=round(float(avg_rating), 1),
        coaching_sessions_count=coaching_count,
        recent_sessions=recent,
        timesheet_status=timesheet_status,
    )


# ──────────────────────────────────────────────
# ADMIN ENDPOINTS (require HR admin)
# ──────────────────────────────────────────────

@router.get("/admin/configs", response_model=list[ManagerConfigResponse])
def list_manager_configs(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
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
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
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
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
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
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
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
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """List all toolkit modules for the org (including inactive)."""
    return list_modules(db, org_id, active_only=False)


@router.post("/admin/toolkit", response_model=ToolkitModuleResponse)
def admin_create_toolkit_module(
    data: ToolkitModuleCreate,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
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
    user_id: uuid.UUID = Depends(get_current_user_id),
    org_id: uuid.UUID = Depends(get_current_org_id),
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
    org_id: uuid.UUID = Depends(get_current_org_id),
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
    return {"ok": True, "created": count, "modules_created": count}
