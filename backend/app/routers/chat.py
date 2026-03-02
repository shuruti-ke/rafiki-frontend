import os
import logging
import httpx
import json
import base64
import traceback
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user_id, get_current_org_id
from app.services.prompt import assemble_prompt
from app.services.document_processor import extract_text_from_bytes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Chat"])

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929").strip()

BACKEND_DIR = Path(__file__).parent.parent.parent
TEXT_DIR = BACKEND_DIR / "uploads" / "text"
PROJECT_MANIFEST = BACKEND_DIR / "uploads" / "project_files.json"
ALLOWED_TEXT_EXTS = {".txt", ".md", ".py", ".js", ".ts", ".json", ".csv", ".html", ".css", ".yml", ".yaml"}
MAX_CONTEXT_CHARS_PER_FILE = 8000
MAX_TOTAL_CONTEXT_CHARS = 20000
class HistoryMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class AttachmentData(BaseModel):
    filename: str
    mime_type: str
    extracted_text: Optional[str] = None
    image_base64: Optional[str] = None
    media_type: Optional[str] = None  # e.g. "image/png"

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[HistoryMessage]] = None
    context_files: Optional[List[str]] = None
    model: Optional[str] = None
    session_id: Optional[str] = None
    attachments: Optional[List[AttachmentData]] = None


class ChatResponse(BaseModel):
    reply: str
    session_id: Optional[str] = None


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


ATTACHMENT_ALLOWED_MIMES = {
    # Documents
    "application/pdf", "text/plain", "text/csv",
    "application/msword",  # .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/vnd.ms-excel",  # .xls
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "application/vnd.ms-powerpoint",  # .ppt
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # .pptx
    # Images
    "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
}
ATTACHMENT_IMAGE_MIMES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}
ATTACHMENT_MAX_SIZE = 20 * 1024 * 1024  # 20 MB


@router.post("/chat/upload-attachment")
async def upload_chat_attachment(
    file: UploadFile = File(...),
):
    """Upload a file for Rafiki to review in the current chat turn. Returns extracted text or base64 image."""
    mime = (file.content_type or "").lower().strip()
    ext = Path(file.filename or "").suffix.lower()

    # Fallback mime detection by extension
    if not mime or mime == "application/octet-stream":
        mime = {
            ".pdf": "application/pdf", ".txt": "text/plain", ".csv": "text/csv",
            ".doc": "application/msword",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xls": "application/vnd.ms-excel",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".ppt": "application/vnd.ms-powerpoint",
            ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".webp": "image/webp", ".gif": "image/gif",
        }.get(ext, mime)

    if mime not in ATTACHMENT_ALLOWED_MIMES:
        raise HTTPException(status_code=400, detail=f"File type not supported: {file.content_type}")

    content_bytes = await file.read()
    if len(content_bytes) > ATTACHMENT_MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")
    if not content_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    filename = Path(file.filename or "attachment").name
    result = {"filename": filename, "mime_type": mime}

    if mime in ATTACHMENT_IMAGE_MIMES:
        result["image_base64"] = base64.b64encode(content_bytes).decode("ascii")
        result["media_type"] = "image/jpeg" if mime == "image/jpg" else mime
    else:
        text = extract_text_from_bytes(content_bytes, mime)
        result["extracted_text"] = text if text else f"[Could not extract text from {filename}]"

    return result


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

        # Append extracted text from attachments to the message
        attachment_text_parts = []
        image_blocks = []
        if req.attachments:
            for att in req.attachments:
                if att.extracted_text:
                    attachment_text_parts.append(f"\n\n### ATTACHED FILE: {att.filename}\n{att.extracted_text}")
                if att.image_base64 and att.media_type:
                    image_blocks.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": att.media_type,
                            "data": att.image_base64,
                        },
                    })

        text_with_attachments = content
        if attachment_text_parts:
            text_with_attachments += "".join(attachment_text_parts)
        if context_blob:
            text_with_attachments += f"\n\n{context_blob}"

        final_user_message = text_with_attachments

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
        # Build messages array with conversation history
        messages = []
        if req.history:
            # Limit to last 20 turns to stay within token limits
            for h in req.history[-20:]:
                role = "assistant" if h.role == "assistant" else "user"
                messages.append({"role": role, "content": h.content})
        # Build user content: multi-modal if images attached, plain text otherwise
        if image_blocks:
            user_content = [*image_blocks, {"type": "text", "text": final_user_message}]
        else:
            user_content = final_user_message
        messages.append({"role": "user", "content": user_content})

        payload = {
            "model": chosen,
            "max_tokens": 4096,
            "system": system_prompt,
            "messages": messages,
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
        reply_text = reply_text.strip() or "..."

        # Persist messages to chat session
        session_id_out = req.session_id
        try:
            from app.models.chat_session import ChatSession, ChatMessage
            if not req.session_id:
                title = content[:50].strip() or "New Chat"
                session = ChatSession(user_id=user_id, org_id=org_id, title=title)
                db.add(session)
                db.flush()
                session_id_out = str(session.id)
            else:
                session = db.query(ChatSession).filter(ChatSession.id == req.session_id).first()
                if session:
                    from sqlalchemy.sql import func
                    session.updated_at = func.now()

            if session_id_out:
                db.add(ChatMessage(session_id=session_id_out, role="user", content=content))
                db.add(ChatMessage(session_id=session_id_out, role="assistant", content=reply_text))
                db.commit()
        except Exception as e:
            logger.warning("Failed to persist chat message: %s", e)
            db.rollback()

        return ChatResponse(reply=reply_text, session_id=session_id_out)

    except HTTPException:
        raise
    except Exception:
        logger.error("CHAT 500 TRACEBACK:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error")
