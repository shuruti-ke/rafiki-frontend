import uuid
from typing import Any, Optional, Union
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog


def _to_uuid(value: Any) -> Optional[uuid.UUID]:
    """Convert value to uuid.UUID, or return None."""
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError):
        return None


def log_action(
    db: Session,
    org_id: Union[uuid.UUID, str, None],
    user_id: Union[uuid.UUID, str, None],
    action: str,
    resource_type: str,
    resource_id: Any = None,
    details: dict | None = None,
    ip_address: str | None = None,
):
    entry = AuditLog(
        org_id=_to_uuid(org_id),
        user_id=_to_uuid(user_id),
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        details=details,
        ip_address=ip_address,
    )
    db.add(entry)
    db.commit()
    return entry
