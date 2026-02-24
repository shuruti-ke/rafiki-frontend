"""
Manager scope resolution — determines which employees a manager can see.

Scope levels:
  L1: direct reports only (OrgMember.reports_to == manager's org_member_id)
  L2: same department as manager
  L3: configurable department list (from manager_config.department_scope)
  L4: org-wide aggregates only (no individual access)
"""

import logging
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.toolkit import ManagerConfig

logger = logging.getLogger(__name__)


def get_manager_config(db: Session, user_id: UUID, org_id: UUID) -> ManagerConfig | None:
    """Get active manager configuration for a user."""
    return (
        db.query(ManagerConfig)
        .filter(
            ManagerConfig.user_id == user_id,
            ManagerConfig.org_id == org_id,
            ManagerConfig.is_active.is_(True),
        )
        .first()
    )


def validate_employee_access(
    db: Session,
    manager_user_id: UUID,
    employee_user_id: UUID,
    org_id: UUID,
) -> bool:
    """Check if a manager has access to view a specific employee's data."""
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
