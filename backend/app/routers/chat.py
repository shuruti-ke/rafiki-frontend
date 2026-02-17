import os
import logging
import httpx
import json
import traceback
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.prompt import assemble_prompt

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Chat"])

BONSAI_API_KEY = os.getenv("BONSAI_API_KEY", "").strip()
BONSAI_BASE_URL = os.getenv("BONSAI_BASE_URL", "https://go.trybons.ai").strip().rstrip("/")
BONSAI_DEFAULT_MODEL = os.getenv("BONSAI_DEFAULT_MODEL", "anthropic/claude-sonnet-4.5").strip()

BACKEND_DIR = Path(__file__).parent.parent.parent
TEXT_DIR = BACKEND_DIR / "uploads" / "text"
PROJECT_MANIFEST = BACKEND_DIR / "uploads" / "project_files.json"
ALLOWED_TEXT_EXTS = {".txt", ".md", ".py", ".js", ".ts", ".json", ".csv", ".html", ".css", ".yml", ".yaml"}
MAX_CONTEXT_CHARS_PER_FILE = 8000
MAX_TOTAL_CONTEXT_CHARS = 20000
DEMO_ORG_ID = 1


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
def chat(req: ChatRequest, db: Session = Depends(get_db)):
    try:
        project_files = _read_project_manifest()
        requested = req.context_files or []
        combined = list(dict.fromkeys([*project_files, *requested]))
        context_blob = load_context_files(combined)

        content = req.message
        final_user_message = content if not context_blob else f"{content}\n\n{context_blob}"

        if not BONSAI_API_KEY:
            raise HTTPException(status_code=503, detail="Bonsai not configured. Set BONSAI_API_KEY in backend/.env")

        chosen = (req.model or "stealth").strip()
        is_stealth = chosen == "stealth"
        if is_stealth:
            chosen = BONSAI_DEFAULT_MODEL

        MAX_USER_CHARS_HARD = 10_000
        if len(final_user_message) > MAX_USER_CHARS_HARD:
            final_user_message = final_user_message[:MAX_USER_CHARS_HARD] + "\n\n[TRUNCATED]"

        # Build system prompt with KB context
        system_prompt = assemble_prompt(
            db=db,
            org_id=DEMO_ORG_ID,
            user_message=content,
        )

        logger.info("model=%s %s  chars=%d", chosen, "(stealth)" if is_stealth else "", len(final_user_message))

        bonsai_url = BONSAI_BASE_URL + "/v1/messages"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {BONSAI_API_KEY}",
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

        r = httpx.post(bonsai_url, headers=headers, json=payload, timeout=60)

        if r.status_code >= 400:
            return ChatResponse(reply=f"Bonsai error ({r.status_code}): {r.text[:500]}")

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
