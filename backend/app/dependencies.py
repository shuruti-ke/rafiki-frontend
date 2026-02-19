"""
Authentication and authorization dependencies.

Supports JWT auth (production) with demo-header fallback when AUTH_MODE=demo.

DB notes (your current schema):
- users table is "users_legacy"
- primary key is users_legacy.user_id (UUID)
- org_id is UUID
- role is Postgres enum user_role_enum
"""

import os
import uuid
from fastapi import HTTPException, Header, Depends
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.services.auth import decode_access_token
from app.models.user import User

AUTH_MODE = os.getenv("AUTH_MODE", "demo")  # "demo" or "jwt"

# Demo placeholders — used only when AUTH_MODE=demo and no token is provided
DEMO_ORG_ID = "00000000-0000-0000-0000-000000000000"
DEMO_USER_ID = "00000000-0000-0000-0000-000000000000"
DEMO_ROLE = "hr_admin"


def _as_uuid(value) -> uuid.UUID:
    if value is None:
        raise ValueError("None is not a UUID")
    if isinstance(value, uuid.UUID):
        return value
    return uuid.UUID(str(value))


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Extract user from Bearer token. Returns None if no token and demo mode."""
    if not authorization:
        return None

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        return None

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    try:
        user_uuid = _as_uuid(sub)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token subject (user id)")

    # users_legacy PK is user_id (UUID)
    user = db.query(User).filter(User.user_id == user_uuid).first()
    if not user or getattr(user, "is_active", True) is False:
        raise HTTPException(status_code=401, detail="User not found or disabled")

    return user


def get_current_user_id(
    authorization: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> uuid.UUID:
    """Extract user UUID from JWT token, or fall back to demo header."""
    if authorization:
        user = get_current_user(authorization, db)
        if user:
            return user.user_id

    if AUTH_MODE == "demo":
        try:
            return _as_uuid(x_user_id or DEMO_USER_ID)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid X-User-Id (must be UUID)")

    raise HTTPException(status_code=401, detail="Not authenticated")


def get_current_org_id(
    authorization: Optional[str] = Header(default=None),
    x_org_id: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> uuid.UUID:
    """Extract org UUID from JWT token, or fall back to demo header."""
    if authorization:
        user = get_current_user(authorization, db)
        if user and user.org_id:
            return user.org_id

    if AUTH_MODE == "demo":
        try:
            return _as_uuid(x_org_id or DEMO_ORG_ID)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid X-Org-Id (must be UUID)")

    raise HTTPException(status_code=401, detail="Not authenticated")


def get_current_role(
    authorization: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> str:
    """Extract role from JWT token, or fall back to demo header."""
    if authorization:
        user = get_current_user(authorization, db)
        if user:
            return str(user.role)

    if AUTH_MODE == "demo":
        return (x_user_role or DEMO_ROLE) or "user"

    raise HTTPException(status_code=401, detail="Not authenticated")


def require_manager(
    authorization: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> str:
    """Require manager or admin role. Returns the role."""
    role = get_current_role(authorization, x_user_role, db)
    if role not in ("manager", "hr_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Manager access required")
    return role


def require_admin(
    authorization: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> str:
    """Require HR admin or super admin role."""
    role = get_current_role(authorization, x_user_role, db)
    if role not in ("hr_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return role


def require_super_admin(
    authorization: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> str:
    """Require super_admin role only."""
    role = get_current_role(authorization, x_user_role, db)
    if role != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return role
