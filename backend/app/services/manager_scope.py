"""
Manager scope resolution — determines which employees a manager can see.

Scope levels:
  L1: direct reports only (OrgMember.reports_to == manager's org_member_id)
  L2: same department as manager
  L3: configurable department list (from manager_config.department_scope)
  L4: org-wide aggregates only (no individual access)
"""

import logging
from sqlalchemy.orm import Session
from app.models.toolkit import ManagerConfig

logger = logging.getLogger(__name__)

# Since OrgMember doesn't exist yet, we use a lightweight "team_members" approach
# based on manager_config + employee user_ids stored in config or derived from org.
# When OrgMember model is added later, this resolves through reports_to FK.

# For now: manager sees employees whose user_id is in the same org_id.
# Scope filtering is applied based on manager_level.


def get_manager_config(db: Session, user_id: int, org_id: int) -> ManagerConfig | None:
    """Get active manager configuration for a user."""
    return (
        db.query(ManagerConfig)
        .filter(
            ManagerConfig.user_id == user_id,
            ManagerConfig.org_id == org_id,
            ManagerConfig.is_active == True,
        )
        .first()
    )


def validate_employee_access(
    db: Session,
    manager_user_id: int,
    employee_user_id: int,
    org_id: uuid,
) -> bool:
    """Check if a manager has access to view a specific employee's data.

    L1: direct reports (for now, all employees in same org — refine when OrgMember exists)
    L2: department-scoped
    L3: multi-department scoped
    L4: aggregate only — no individual access
    """
    config = get_manager_config(db, manager_user_id, org_id)
    if not config:
        return False

    # Manager can't view their own data through manager tools
    if manager_user_id == employee_user_id:
        return False

    # L4 managers can only see aggregates, not individuals
    if config.manager_level == "L4":
        return False

    # For L1/L2/L3: allow access within org
    # TODO: When OrgMember model exists, enforce reports_to hierarchy for L1
    # and department filtering for L2/L3
    return True


def get_allowed_data_types(db: Session, user_id: int, org_id: int) -> list[str]:
    """Get which data types a manager is allowed to access."""
    config = get_manager_config(db, user_id, org_id)
    if not config:
        return []
    return config.allowed_data_types or []


def get_allowed_features(db: Session, user_id: int, org_id: int) -> list[str]:
    """Get which features a manager is allowed to use."""
    config = get_manager_config(db, user_id, org_id)
    if not config:
        return []
    return config.allowed_features or []


def can_use_feature(db: Session, user_id: int, org_id: int, feature: str) -> bool:
    """Check if a manager can use a specific feature."""
    return feature in get_allowed_features(db, user_id, org_id)
