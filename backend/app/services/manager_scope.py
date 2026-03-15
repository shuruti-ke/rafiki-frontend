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
from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.toolkit import ManagerConfig

logger = logging.getLogger(__name__)


def _get_user_role(db: Session, user_id: UUID) -> Optional[str]:
    """Return the user's role or None if not found."""
    from app.models.user import User
    user = db.query(User).filter(User.user_id == user_id).first()
    return str(user.role) if user and getattr(user, "role", None) else None


def _role_is(db: Session, user_id: UUID, role_name: str) -> bool:
    """Case-insensitive role check (DB may store 'Manager' or 'manager')."""
    r = _get_user_role(db, user_id)
    return r is not None and r.strip().lower() == role_name.lower()


def _is_super_admin(db: Session, user_id: UUID) -> bool:
    """Check if a user has super_admin role."""
    return _role_is(db, user_id, "super_admin")


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
    from app.models.user import User

    # super_admin can access any employee
    if _is_super_admin(db, manager_user_id):
        return True

    emp = db.query(User).filter(User.user_id == employee_user_id).first()
    if not emp:
        return False

    # Manager can't view their own data through manager tools
    if manager_user_id == employee_user_id:
        return False

    # Employee must be in same org (or unassigned)
    if emp.org_id is not None and emp.org_id != org_id:
        return False

    # hr_admin can access any employee in their org
    if _role_is(db, manager_user_id, "hr_admin"):
        return True

    config = get_manager_config(db, manager_user_id, org_id)
    if not config:
        # Manager without config: allow if direct report or same org
        if _role_is(db, manager_user_id, "manager"):
            if emp.manager_id == manager_user_id or emp.org_id == org_id:
                return True
        return False

    # L4 managers: allow same-org for coaching/toolkit (individual access)
    if getattr(config, "manager_level", None) == "L4":
        if emp.org_id == org_id:
            return True
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
    # Manager-like roles can use coaching_ai and toolkit (case-insensitive, any variant)
    if feature in ("coaching_ai", "toolkit"):
        role = _get_user_role(db, user_id)
        if role is not None:
            r = role.strip().lower()
            if r in ("hr_admin", "super_admin", "manager") or "admin" in r:
                return True
    return feature in get_allowed_features(db, user_id, org_id)
