import os
import json
import logging
import httpx
from dotenv import load_dotenv
from pathlib import Path
from app.services.safety_gate import check_composed_content

load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env", override=True)

logger = logging.getLogger(__name__)

BONSAI_API_KEY = os.getenv("BONSAI_API_KEY", "").strip()
BONSAI_BASE_URL = os.getenv("BONSAI_BASE_URL", "https://go.trybons.ai").strip().rstrip("/")
BONSAI_DEFAULT_MODEL = os.getenv("BONSAI_DEFAULT_MODEL", "anthropic/claude-sonnet-4.5").strip()

COMPOSER_SYSTEM_PROMPT = """You are the Rafiki Module Composer.
You receive a module blueprint (fixed psychological structure) and a context pack.
Your job: adapt the wording, examples, scenarios, and micro-actions to fit the context.

RULES:
- Keep ALL steps in the exact order given. Do not add or remove steps.
- Keep step types and expected_input unchanged.
- Keep media_url unchanged if present.
- Adapt ONLY: message text, option labels (if multiple_choice), example scenarios.
- Use context to make examples role-relevant and culturally aligned.
- If a role stressor_profile mentions "high_emotional_labor", use empathetic scenarios.
- If work_pattern is "night_shift", reference fatigue and schedule challenges.
- Do NOT mention employer monitoring, HR, job descriptions, or surveillance.
- Do NOT make diagnostic claims.
- Respond ONLY with a valid JSON array of adapted steps. No markdown, no explanation."""


def compose_module(
    blueprint_steps: list[dict],
    context_pack: dict,
    module_name: str,
) -> list[dict]:
    """Call LLM to adapt blueprint steps using context pack.

    Returns adapted steps, or falls back to raw blueprint on failure.
    """
    if not BONSAI_API_KEY:
        logger.warning("Bonsai not configured — returning raw blueprint")
        return blueprint_steps

    user_prompt = json.dumps({
        "module_name": module_name,
        "context_pack": context_pack,
        "blueprint_steps": blueprint_steps,
    }, indent=2)

    try:
        bonsai_url = BONSAI_BASE_URL + "/v1/messages"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {BONSAI_API_KEY}",
            "anthropic-version": "2023-06-01",
        }
        payload = {
            "model": BONSAI_DEFAULT_MODEL,
            "max_tokens": 4096,
            "system": COMPOSER_SYSTEM_PROMPT,
            "messages": [
                {"role": "user", "content": user_prompt},
            ],
        }

        r = httpx.post(bonsai_url, headers=headers, json=payload, timeout=60)

        if r.status_code >= 400:
            logger.error("Composer LLM error (%d): %s", r.status_code, r.text[:300])
            return blueprint_steps

        data = r.json()
        reply_text = ""
        for block in (data.get("content") or []):
            if isinstance(block, dict) and block.get("type") == "text":
                reply_text += block.get("text", "")

        # Parse JSON from response
        adapted_steps = json.loads(reply_text.strip())

        if not isinstance(adapted_steps, list):
            logger.error("Composer returned non-list — falling back")
            return blueprint_steps

        if len(adapted_steps) != len(blueprint_steps):
            logger.error("Composer returned %d steps, expected %d — falling back",
                         len(adapted_steps), len(blueprint_steps))
            return blueprint_steps

        # Preserve structural fields from blueprint
        for i, (adapted, original) in enumerate(zip(adapted_steps, blueprint_steps)):
            adapted["type"] = original["type"]
            adapted["expected_input"] = original.get("expected_input")
            adapted["safety_check"] = original.get("safety_check", False)
            if original.get("media_url"):
                adapted["media_url"] = original["media_url"]

        # Safety gate
        is_safe, violations = check_composed_content(adapted_steps)
        if not is_safe:
            logger.warning("Safety gate failed: %s — falling back to blueprint", violations)
            return blueprint_steps

        return adapted_steps

    except json.JSONDecodeError as e:
        logger.error("Composer JSON parse error: %s", e)
        return blueprint_steps
    except Exception as e:
        logger.error("Composer error: %s", e)
        return blueprint_steps
