import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.dependencies import get_current_org_id

router = APIRouter(prefix="/api/v1/org-members", tags=["Org Members"])


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
    return [
        {
            "user_id": str(u.user_id),
            "email": u.email,
            "name": getattr(u, "full_name", None) or getattr(u, "name", None) or u.email,
            "role": str(u.role) if u.role else "user",
        }
        for u in users
    ]
