import os
import logging
import httpx
import json
import traceback
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id
from app.services.prompt import assemble_prompt

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Chat"])

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929").strip()

BACKEND_DIR = Path(__file__).parent.parent.parent
TEXT_DIR = BACKEND_DIR / "uploads" / "text"
PROJECT_MANIFEST = BACKEND_DIR / "uploads" / "project_files.json"
ALLOWED_TEXT_EXTS = {".txt", ".md", ".py", ".js", ".ts", ".json", ".csv", ".html", ".css", ".yml", ".yaml"}
MAX_CONTEXT_CHARS_PER_FILE = 8000
MAX_TOTAL_CONTEXT_CHARS = 20000
class ChatRequest(BaseModel):
    message: str
    context_files: Optional[List[str]] = None
    model: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str


def load_context_files(names):
    if not names:
        return ""

    chunks = []
    total = 0

    for name in names:
        safe_name = Path(name).name
        path = TEXT_DIR / safe_name

        if not path.exists() or not path.is_file():
            continue
        if path.suffix.lower() not in ALLOWED_TEXT_EXTS:
            continue

        text = path.read_text(encoding="utf-8", errors="replace")
        text = text[:MAX_CONTEXT_CHARS_PER_FILE]

        block = f"\n\n### FILE: {safe_name}\n```{path.suffix.lstrip('.')}\n{text}\n```"
        if total + len(block) > MAX_TOTAL_CONTEXT_CHARS:
            break

        chunks.append(block)
        total += len(block)

    if not chunks:
        return ""

    return "You have the following project files as context:" + "".join(chunks)


def _read_project_manifest():
    if not PROJECT_MANIFEST.exists():
        return []
    try:
        data = json.loads(PROJECT_MANIFEST.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return [Path(x).name for x in data]
    except Exception:
        pass
    return []


@router.post("/chat", response_model=ChatResponse)
def chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    org_id: UUID = Depends(get_current_org_id),
):
    try:
        project_files = _read_project_manifest()
        requested = req.context_files or []
        combined = list(dict.fromkeys([*project_files, *requested]))
        context_blob = load_context_files(combined)

        content = req.message
        final_user_message = content if not context_blob else f"{content}\n\n{context_blob}"

        if not ANTHROPIC_API_KEY:
            raise HTTPException(status_code=503, detail="Anthropic API not configured. Set ANTHROPIC_API_KEY in environment.")

        chosen = ANTHROPIC_MODEL

        MAX_USER_CHARS_HARD = 10_000
        if len(final_user_message) > MAX_USER_CHARS_HARD:
            final_user_message = final_user_message[:MAX_USER_CHARS_HARD] + "\n\n[TRUNCATED]"

        # Build personalized system prompt with full context
        system_prompt = assemble_prompt(
            db=db,
            org_id=org_id,
            user_id=user_id,
            user_message=content,
        )

        logger.info("model=%s  user=%s  msg_chars=%d  system_chars=%d", chosen, user_id, len(final_user_message), len(system_prompt))

        headers = {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        }
        payload = {
            "model": chosen,
            "max_tokens": 4096,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": final_user_message},
            ],
        }

        r = httpx.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload, timeout=60)

        if r.status_code >= 400:
            logger.error("Anthropic API error (%d): %s", r.status_code, r.text[:500])
            return ChatResponse(reply=f"AI service error ({r.status_code}). Please try again.")

        data = r.json()
        reply_text = ""
        for block in (data.get("content") or []):
            if isinstance(block, dict) and block.get("type") == "text":
                reply_text += block.get("text", "")
        return ChatResponse(reply=reply_text.strip() or "...")

    except HTTPException:
        raise
    except Exception:
        logger.error("CHAT 500 TRACEBACK:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error")
