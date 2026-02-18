"""
Authentication and authorization dependencies.

Currently uses demo placeholders (DEMO_ORG_ID, DEMO_USER_ID).
In production, these will extract from JWT tokens.
"""

from fastapi import HTTPException, Header
from typing import Optional

# Demo placeholders — replace with JWT extraction in production
DEMO_ORG_ID = 1
DEMO_USER_ID = 1
DEMO_ROLE = "hr_admin"  # For dev: pretend current user is admin


def get_current_user_id(x_user_id: Optional[int] = Header(default=None)) -> int:
    """Extract user ID from header or fall back to demo."""
    return x_user_id or DEMO_USER_ID


def get_current_org_id(x_org_id: Optional[int] = Header(default=None)) -> int:
    """Extract org ID from header or fall back to demo."""
    return x_org_id or DEMO_ORG_ID


def get_current_role(x_user_role: Optional[str] = Header(default=None)) -> str:
    """Extract role from header or fall back to demo."""
    return x_user_role or DEMO_ROLE


def require_manager(
    x_user_role: Optional[str] = Header(default=None),
) -> str:
    """Require manager or admin role. Returns the role."""
    role = x_user_role or DEMO_ROLE
    if role not in ("manager", "hr_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Manager access required")
    return role


def require_admin(
    x_user_role: Optional[str] = Header(default=None),
) -> str:
    """Require HR admin or super admin role."""
    role = x_user_role or DEMO_ROLE
    if role not in ("hr_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return role


def require_super_admin(
    x_user_role: Optional[str] = Header(default=None),
) -> str:
    """Require super admin role only."""
    role = x_user_role or DEMO_ROLE
    if role != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return role
