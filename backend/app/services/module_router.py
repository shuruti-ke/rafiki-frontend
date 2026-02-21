import uuid
import zlib
from typing import Any, Union

from sqlalchemy.orm import Session
from app.models.guided_path import GuidedModule

ROUTING_RULES = {
    "anxiety": ["anxiety_relief", "breathing_reset", "grounding_exercise"],
    "stress": ["burnout_check", "stress_decompress", "boundary_setting"],
    "sleep": ["sleep_hygiene", "wind_down_routine"],
    "conflict": ["conflict_navigator", "communication_reset"],
    "financial": ["financial_stress_check", "financial_planning_start"],
    "motivation": ["motivation_boost", "values_reconnect"],
    "workload": ["burnout_check", "boundary_setting", "time_audit"],
}

# Category name → themes it matches
CATEGORY_TO_THEMES = {}
for theme, categories in ROUTING_RULES.items():
    for cat in categories:
        CATEGORY_TO_THEMES.setdefault(cat, []).append(theme)


def _uuidish_to_int(value: Any, *, fallback: int = 0) -> int:
    """
    Convert UUID/UUID-string to a stable non-negative 32-bit int
    for legacy INTEGER org_id columns (guided_modules.org_id).
    """
    if value is None:
        return fallback

    if isinstance(value, int):
        return value

    try:
        u = value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
        return zlib.crc32(u.bytes) & 0x7FFFFFFF
    except Exception:
        try:
            s = str(value).encode("utf-8", errors="ignore")
            return zlib.crc32(s) & 0x7FFFFFFF
        except Exception:
            return fallback


def suggest_modules(
    db: Session,
    org_id: Union[int, uuid.UUID, str],
    theme: str | None = None,
    stress_band: str | None = None,
    available_time: int | None = None,
) -> list[dict]:
    """Rules-based module suggestion. Returns ranked list of modules."""
    legacy_org_id = _uuidish_to_int(org_id, fallback=0)

    # Get all active modules for this org (including globals)
    modules = (
        db.query(GuidedModule)
        .filter(
            (GuidedModule.org_id == legacy_org_id) | (GuidedModule.org_id.is_(None)),
            GuidedModule.is_active == True,
        )
        .all()
    )

    if not modules:
        return []

    # Score each module
    scored: list[dict] = []
    for mod in modules:
        score = 0
        reason = ""
        cat = (mod.category or "").lower().replace(" ", "_")

        # Theme match
        if theme:
            theme_lower = theme.lower()
            preferred = ROUTING_RULES.get(theme_lower, [])
            if cat in preferred:
                score += 10
                reason = f"Matches theme: {theme}"
            elif theme_lower in (mod.name or "").lower():
                score += 5
                reason = f"Name matches theme: {theme}"

        # Time filter — prefer modules that fit available time
        if available_time and mod.duration_minutes:
            if mod.duration_minutes <= available_time:
                score += 3
            else:
                score -= 5  # penalize too-long modules

        # High stress → prefer shorter calming modules
        if stress_band in ("high", "crisis"):
            if cat in ("breathing_reset", "grounding_exercise", "stress_decompress"):
                score += 5
            if mod.duration_minutes and mod.duration_minutes <= 5:
                score += 2

        # Default base score for active modules
        score += 1

        scored.append(
            {
                "module": mod,
                "score": score,
                "reason": reason or "Available module",
            }
        )

    # Sort by score descending, take top 3
    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[:3]

    return [
        {
            "id": s["module"].id,
            "name": s["module"].name,
            "category": s["module"].category,
            "description": s["module"].description,
            "duration_minutes": s["module"].duration_minutes,
            "icon": s["module"].icon,
            "match_reason": s["reason"],
        }
        for s in top
    ]
