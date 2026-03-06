"""
Manager scope resolution — determines which employees a manager can see.

Scope levels:
  L1: direct reports only (OrgMember.reports_to == manager's org_member_id)
  L2: same department as manager
  L3: configurable department list (from manager_config.department_scope)
  L4: org-wide aggregates only (no individual access)

super_admin bypasses all scope checks.
"""

import logging
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.toolkit import ManagerConfig

logger = logging.getLogger(__name__)


def _is_super_admin(db: Session, user_id: UUID) -> bool:
    """Check if a user has super_admin role."""
    from app.models.user import User
    user = db.query(User).filter(User.user_id == user_id).first()
    return user is not None and str(user.role) == "super_admin"


def get_manager_config(db: Session, user_id: UUID, org_id: UUID) -> ManagerConfig | None:
    """Get active manager configuration for a user. super_admin bypasses."""
    config = (
        db.query(ManagerConfig)
        .filter(
            ManagerConfig.user_id == user_id,
            ManagerConfig.org_id == org_id,
            ManagerConfig.is_active.is_(True),
        )
        .first()
    )
    if config:
        return config

    # super_admin bypass: return a synthetic config so callers don't 403
    if _is_super_admin(db, user_id):
        synthetic = ManagerConfig(
            user_id=user_id,
            org_id=org_id,
            manager_level="L1",
            allowed_data_types=["performance", "objectives", "timesheets"],
            allowed_features=["coaching_ai", "toolkit"],
            department_scope=[],
            is_active=True,
        )
        return synthetic

    return None


def validate_employee_access(
    db: Session,
    manager_user_id: UUID,
    employee_user_id: UUID,
    org_id: UUID,
) -> bool:
    """Check if a manager has access to view a specific employee's data."""
    # super_admin can access any employee
    if _is_super_admin(db, manager_user_id):
        return True

    config = get_manager_config(db, manager_user_id, org_id)
    if not config:
        return False

    # Manager can't view their own data through manager tools
    if manager_user_id == employee_user_id:
        return False

    # L4 managers can only see aggregates, not individuals
    if config.manager_level == "L4":
        return False

    # TODO: enforce hierarchy/department scoping when OrgMember exists
    return True


def get_allowed_data_types(db: Session, user_id: UUID, org_id: UUID) -> list[str]:
    config = get_manager_config(db, user_id, org_id)
    return config.allowed_data_types or [] if config else []


def get_allowed_features(db: Session, user_id: UUID, org_id: UUID) -> list[str]:
    config = get_manager_config(db, user_id, org_id)
    return config.allowed_features or [] if config else []


def can_use_feature(db: Session, user_id: UUID, org_id: UUID, feature: str) -> bool:
    return feature in get_allowed_features(db, user_id, org_id)
