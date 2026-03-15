"""
HR Toolkit AI — generate toolkit modules on demand using OpenAI.
"""

import json
import logging
import os
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env", override=True)

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com").strip().rstrip("/")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()

TOOLKIT_CATEGORIES = ["coaching", "conversation", "pip", "development", "conflict", "compliance"]

SYSTEM_PROMPT = """You are an HR and management expert. You create practical toolkit modules for managers.

Output ONLY valid JSON (no markdown, no explanation) in this exact shape:
{
  "title": "Short, clear module title",
  "category": "one of: coaching, conversation, pip, development, conflict, compliance",
  "content": {
    "sections": [
      {
        "heading": "Section title",
        "body": "2-4 sentences of actionable guidance.",
        "prompts": ["Optional list of suggested phrases or questions the manager can use or copy"]
      }
    ]
  }
}

Rules:
- Create 3-6 sections. Each section: one clear heading, concise body text, 0-4 prompts.
- Prompts should be copy-paste ready (e.g. questions to ask, opening lines).
- Keep tone professional, supportive, and practical. Suitable for East African workplace context where relevant.
- Do not mention surveillance, monitoring, or HR policing. Focus on development and fair process.
- category must be exactly one of: coaching, conversation, pip, development, conflict, compliance."""


def generate_toolkit_with_ai(prompt: str, category: str | None = None) -> dict[str, Any] | None:
    """
    Generate a toolkit module from a natural-language prompt using OpenAI.
    Returns a dict with keys: title, category, content (with sections).
    Returns None if OpenAI is not configured or generation fails.
    """
    if not OPENAI_API_KEY:
        logger.warning("OpenAI not configured — cannot generate toolkit")
        return None

    user_content = prompt.strip()
    if not user_content:
        return None

    if category and category not in TOOLKIT_CATEGORIES:
        category = None

    if category:
        user_content = f"Category to use: {category}\n\nRequest: {user_content}"
    else:
        user_content = f"Choose the most appropriate category.\n\nRequest: {user_content}"

    try:
        base = OPENAI_BASE_URL.rstrip("/")
        openai_url = f"{base}/v1/chat/completions" if "/v1" not in base else f"{base}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        }
        payload = {
            "model": OPENAI_MODEL,
            "max_tokens": 2048,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
        }

        r = httpx.post(openai_url, headers=headers, json=payload, timeout=45)
        if r.status_code >= 400:
            logger.error("Toolkit AI error (%s): %s", r.status_code, r.text[:400])
            return None

        data = r.json()
        reply = (data.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""
        out = json.loads(reply.strip())

        if not isinstance(out.get("content"), dict) or not isinstance(out["content"].get("sections"), list):
            logger.error("Toolkit AI returned invalid structure")
            return None

        out.setdefault("title", "Generated Toolkit")
        out.setdefault("category", "coaching")
        if out["category"] not in TOOLKIT_CATEGORIES:
            out["category"] = "coaching"

        for sec in out["content"]["sections"]:
            sec.setdefault("heading", "Section")
            sec.setdefault("body", "")
            sec.setdefault("prompts", [])

        return out
    except json.JSONDecodeError as e:
        logger.exception("Toolkit AI JSON decode error: %s", e)
        return None
    except Exception as e:
        logger.exception("Toolkit AI error: %s", e)
        return None
