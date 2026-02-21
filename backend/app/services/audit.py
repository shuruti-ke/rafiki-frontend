import uuid
import zlib
from typing import Any, Optional, Union
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def _uuidish_to_int(value: Any, *, fallback: int = 0) -> int:
    """
    Convert UUID/UUID-string to a stable int for legacy INTEGER columns.
    - int -> int
    - uuid.UUID / uuid string -> stable 32-bit int (non-negative)
    - None/unknown -> fallback
    """
    if value is None:
        return fallback

    if isinstance(value, int):
        return value

    try:
        u = value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
        # stable 32-bit hash -> fits Postgres INT
        return zlib.crc32(u.bytes) & 0x7FFFFFFF
    except Exception:
        # last resort: hash string representation
        try:
            s = str(value).encode("utf-8", errors="ignore")
            return zlib.crc32(s) & 0x7FFFFFFF
        except Exception:
            return fallback


def log_action(
    db: Session,
    org_id: Union[int, uuid.UUID, str],
    user_id: Union[int, uuid.UUID, str],
    action: str,
    resource_type: str,
    resource_id: Any = None,
    details: dict | None = None,
    ip_address: str | None = None,
):
    # Preserve original values for future UUID migration
    base_details = details.copy() if isinstance(details, dict) else {}
    base_details.setdefault("_raw_ids", {})
    base_details["_raw_ids"].update(
        {
            "org_id": str(org_id) if org_id is not None else None,
            "user_id": str(user_id) if user_id is not None else None,
            "resource_id": str(resource_id) if resource_id is not None else None,
        }
    )

    entry = AuditLog(
        org_id=_uuidish_to_int(org_id, fallback=0),
        user_id=_uuidish_to_int(user_id, fallback=0),
        action=action,
        resource_type=resource_type,
        resource_id=_uuidish_to_int(resource_id, fallback=None) if resource_id is not None else None,
        details=base_details,
        ip_address=ip_address,
    )
    db.add(entry)
    db.commit()
    return entry
