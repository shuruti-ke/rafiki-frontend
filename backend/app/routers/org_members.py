import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.dependencies import get_current_org_id, require_admin

router = APIRouter(prefix="/api/v1/org-members", tags=["Org Members"])


def _user_dict(u):
    return {
        "user_id": str(u.user_id),
        "email": u.email,
        "name": getattr(u, "full_name", None) or getattr(u, "name", None) or u.email,
        "role": str(u.role) if u.role else "user",
        "department": getattr(u, "department", None),
        "job_title": getattr(u, "job_title", None),
        "manager_id": str(u.manager_id) if getattr(u, "manager_id", None) else None,
    }


@router.get("/")
def list_org_members(
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    """List all users in the current organization."""
    users = (
        db.query(User)
        .filter(User.org_id == org_id, User.is_active == True)
        .order_by(User.created_at.desc())
        .all()
    )
    return [_user_dict(u) for u in users]


@router.get("/{user_id}")
def get_org_member(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    """Get a single org member by user_id."""
    u = (
        db.query(User)
        .filter(User.user_id == user_id, User.org_id == org_id)
        .first()
    )
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_dict(u)


class UpdateMemberRequest(BaseModel):
    department: Optional[str] = None
    job_title: Optional[str] = None
    manager_id: Optional[str] = None


@router.put("/{user_id}")
def update_org_member(
    user_id: uuid.UUID,
    data: UpdateMemberRequest,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    _role: str = Depends(require_admin),
):
    """Update department, job_title, manager_id for a user (admin only)."""
    u = (
        db.query(User)
        .filter(User.user_id == user_id, User.org_id == org_id)
        .first()
    )
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    if data.department is not None:
        u.department = data.department
    if data.job_title is not None:
        u.job_title = data.job_title
    if data.manager_id is not None:
        u.manager_id = uuid.UUID(data.manager_id) if data.manager_id else None

    db.commit()
    db.refresh(u)
    return _user_dict(u)
