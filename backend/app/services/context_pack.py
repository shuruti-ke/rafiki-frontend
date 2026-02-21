from uuid import UUID
from sqlalchemy.orm import Session
from app.models.org_profile import OrgProfile, RoleProfile


def build_context_pack(
    db: Session,
    org_id: UUID,
    role_key: str | None = None,
    session_vars: dict | None = None,
) -> dict:
    """Assemble the context pack for LLM module composition (UUID org_id)."""
    session_vars = session_vars or {}

    # Fetch org profile (UUID org_id)
    org = db.query(OrgProfile).filter(OrgProfile.org_id == org_id).first()
    org_block = {
        "purpose": org.org_purpose if org else None,
        "industry": org.industry if org else None,
        "work_environment": org.work_environment if org else None,
        "benefits_tags": org.benefits_tags if org else [],
    }

    # Fetch role profile (UUID org_id)
    role_block = {
        "family": None,
        "seniority_band": None,
        "work_pattern": None,
        "stressor_profile": [],
    }
    if role_key:
        role = (
            db.query(RoleProfile)
            .filter(RoleProfile.org_id == org_id, RoleProfile.role_key == role_key)
            .first()
        )
        if role:
            role_block = {
                "family": role.role_family,
                "seniority_band": role.seniority_band,
                "work_pattern": role.work_pattern,
                "stressor_profile": role.stressor_profile or [],
            }

    # Session variables
    session_block = {
        "language": session_vars.get("language", "en"),
        "stress_band": session_vars.get("stress_band"),
        "theme_category": session_vars.get("theme_category"),
        "available_time": session_vars.get("available_time"),
    }

    return {
        "org": org_block,
        "role": role_block,
        "session": session_block,
    }
