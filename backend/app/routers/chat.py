import os
import logging
import httpx
import json
import base64
import traceback
from datetime import date, datetime
from decimal import Decimal
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
from app.services.crisis_detector import quick_safety_screen, analyze_safety, get_safety_prompt_injection, analyze_sentiment_background
from app.services.helpline_directory import get_helplines, format_helplines_for_prompt
from app.services.agent_tools import TOOL_DEFINITIONS, execute_tool
from app.services.user_context import build_user_context

logger = logging.getLogger(__name__)


def _json_serial_default(obj):
    """For json.dumps: serialize date, datetime, Decimal, UUID so tool results never raise TypeError."""
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, UUID):
        return str(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


router = APIRouter(prefix="/api/v1", tags=["Chat"])

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_BASE_URL = (os.getenv("OPENAI_BASE_URL", "https://api.openai.com").strip().rstrip("/"))
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "").strip()

BACKEND_DIR = Path(__file__).parent.parent.parent
TEXT_DIR = BACKEND_DIR / "uploads" / "text"
PROJECT_MANIFEST = BACKEND_DIR / "uploads" / "project_files.json"
ALLOWED_TEXT_EXTS = {".txt", ".md", ".py", ".js", ".ts", ".json", ".csv", ".html", ".css", ".yml", ".yaml"}
MAX_CONTEXT_CHARS_PER_FILE = 8000
MAX_TOTAL_CONTEXT_CHARS = 20000

_PRIVILEGED_ROLES = {"hr_admin", "super_admin"}

# Maximum tool-call iterations to prevent runaway loops
MAX_TOOL_ITERATIONS = 6


# ──────────────────────────────────────────────────────────────────────────────
# Search helpers (unchanged from Sprint 5)
# ──────────────────────────────────────────────────────────────────────────────

def _should_search(message: str, chat_history: list | None = None) -> bool:
    if not TAVILY_API_KEY or not OPENAI_API_KEY:
        return False
    if len(message.strip()) < 8:
        return False

    history_snippet = ""
    if chat_history:
        recent = chat_history[-3:]
        history_snippet = "\n".join(
            f"{m['role'].upper()}: {m['content'][:120]}" for m in recent
        )

    classifier_prompt = (
        "You are a search intent classifier. "
        "Decide if the user's message requires a real-time web search to answer accurately.\n\n"
        "Answer YES if the message asks about:\n"
        "- Current prices, rates, costs, availability\n"
        "- Specific real-world places (hotels, restaurants, hospitals, offices, etc.)\n"
        "- Recent news, events, or announcements\n"
        "- Contact details, addresses, phone numbers\n"
        "- Weather, transport, schedules\n"
        "- Any factual information that changes over time or requires local knowledge\n"
        "- Recommendations for specific real-world services or products\n"
        "- Any question where making up an answer could mislead the user\n\n"
        "Answer NO if the message is:\n"
        "- Casual conversation or greetings\n"
        "- Questions about the user's own data (timesheets, objectives, documents)\n"
        "- General wellbeing, emotional support, or career advice\n"
        "- Workplace policy questions answerable from internal documents\n"
        "- Generic how-to questions the model can answer from training\n\n"
        f"Recent conversation context:\n{history_snippet}\n\n"
        f"User message: {message}\n\n"
        "Reply with ONLY the single word YES or NO."
    )

    try:
        base = OPENAI_BASE_URL.rstrip("/")
        url = f"{base}/v1/chat/completions" if "/v1" not in base else f"{base}/chat/completions"
        resp = httpx.post(
            url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENAI_API_KEY}",
            },
            json={
                "model": OPENAI_MODEL,
                "max_tokens": 5,
                "messages": [{"role": "user", "content": classifier_prompt}],
            },
            timeout=8,
        )
        if resp.status_code == 200:
            result = resp.json()
            text = (result.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""
            decision = text.strip().upper()
            logger.info("Search classifier decision: %s for: %.80s", decision, message)
            return decision.startswith("YES")
    except Exception as e:
        logger.warning("Search classifier failed: %s", e)

    return False


def _tavily_search(query: str, max_results: int = 5) -> str:
    if not TAVILY_API_KEY:
        return ""
    try:
        resp = httpx.post(
            "https://api.tavily.com/search",
            json={
                "api_key": TAVILY_API_KEY,
                "query": query,
                "search_depth": "basic",
                "max_results": max_results,
                "include_answer": True,
                "include_raw_content": False,
            },
            timeout=15,
        )
        if resp.status_code != 200:
            logger.warning("Tavily returned %d: %s", resp.status_code, resp.text[:200])
            return ""

        data = resp.json()
        parts = []
        if data.get("answer"):
            parts.append(f"SUMMARY: {data['answer']}\n")
        for i, result in enumerate(data.get("results", []), 1):
            title = result.get("title", "")
            url = result.get("url", "")
            snippet = result.get("content", "")[:600]
            parts.append(f"[{i}] {title}\nURL: {url}\n{snippet}\n")
        if not parts:
            return ""
        return (
            "\n══════════════════════════════════════\n"
            "SUPPLEMENTARY WEB RESULTS (use ONLY to enrich or extend an answer already grounded in company KB data — "
            "never use these as the primary source for company policy, rates, or allowances):\n"
            "══════════════════════════════════════\n"
            + "\n".join(parts)
            + "\nSOURCE: Tavily real-time web search\n"
            "══════════════════════════════════════\n"
        )
    except Exception as e:
        logger.warning("Tavily search failed: %s", e)
        return ""


def _openai_tools_from_definitions():
    """Convert Anthropic-style TOOL_DEFINITIONS to OpenAI API tools format."""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t.get("input_schema", {"type": "object", "properties": {}, "required": []}),
            },
        }
        for t in TOOL_DEFINITIONS
    ]


def _build_search_query(message: str, chat_history: list | None) -> str:
    context = ""
    if chat_history:
        for msg in reversed(chat_history[-4:]):
            if msg.get("role") == "user":
                context = msg.get("content", "")[:100]
                break
    query = message.strip()
    location_words = ["mombasa", "nairobi", "kenya", "uganda", "tanzania", "rwanda", "east africa"]
    if not any(w in query.lower() for w in location_words):
        if any(w in query.lower() for w in ["hotel", "restaurant", "hospital", "clinic", "price"]):
            query += " Kenya East Africa"
    return query[:300]


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ──────────────────────────────────────────────────────────────────────────────

class HistoryMessage(BaseModel):
    role: str
    content: str


class AttachmentData(BaseModel):
    filename: str
    mime_type: str
    extracted_text: Optional[str] = None
    image_base64: Optional[str] = None
    media_type: Optional[str] = None


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
    # Sprint 6: surface structured action cards to the frontend
    action_cards: Optional[List[dict]] = None


# ──────────────────────────────────────────────────────────────────────────────
# File context helpers (unchanged)
# ──────────────────────────────────────────────────────────────────────────────

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
    "application/pdf", "text/plain", "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
}
ATTACHMENT_IMAGE_MIMES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}
ATTACHMENT_MAX_SIZE = 20 * 1024 * 1024  # 20 MB


# ──────────────────────────────────────────────────────────────────────────────
# Upload endpoint (unchanged)
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/chat/upload-attachment")
async def upload_chat_attachment(file: UploadFile = File(...)):
    """Upload a file for Rafiki to review in the current chat turn."""
    mime = (file.content_type or "").lower().strip()
    ext = Path(file.filename or "").suffix.lower()
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


# ──────────────────────────────────────────────────────────────────────────────
# Agentic tool-calling loop
# ──────────────────────────────────────────────────────────────────────────────

def _run_agentic_loop(
    messages: list,
    system_prompt: str,
    chosen_model: str,
    user_id: UUID,
    org_id: UUID,
    db: Session,
) -> tuple[str, list]:
    """
    Run the OpenAI tool-calling loop.

    Returns:
        (final_reply_text, action_cards)
        action_cards is a list of structured dicts for the frontend to render.
    """
    if not OPENAI_API_KEY:
        return "AI is not configured (set OPENAI_API_KEY).", []

    base = OPENAI_BASE_URL.rstrip("/")
    url = f"{base}/v1/chat/completions" if "/v1" not in base else f"{base}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}",
    }
    openai_tools = _openai_tools_from_definitions()
    # Build request messages: system first, then conversation
    request_messages = [{"role": "system", "content": system_prompt}] + messages

    action_cards: list[dict] = []
    iteration = 0

    while iteration < MAX_TOOL_ITERATIONS:
        iteration += 1

        payload = {
            "model": chosen_model,
            "max_tokens": 4096,
            "messages": request_messages,
            "tools": openai_tools,
        }

        r = httpx.post(url, headers=headers, json=payload, timeout=90)

        if r.status_code >= 400:
            logger.error("OpenAI API error (%d): %s", r.status_code, r.text[:500])
            return f"AI service error ({r.status_code}). Please try again.", action_cards

        data = r.json()
        choice = (data.get("choices") or [{}])[0]
        msg = choice.get("message", {})
        content = msg.get("content") or ""
        tool_calls = msg.get("tool_calls") or []

        # ── No tool calls → final text response ──
        if not tool_calls:
            return (content.strip() or "..."), action_cards

        # ── Process tool calls ──
        # Append assistant message (with tool_calls) to request_messages
        request_messages.append({
            "role": "assistant",
            "content": content or "",
            "tool_calls": [
                {"id": tc["id"], "type": "function", "function": {"name": tc["function"]["name"], "arguments": tc["function"].get("arguments", "{}")}}
                for tc in tool_calls
            ],
        })

        tool_messages = []
        for tc in tool_calls:
            t_id = tc.get("id", "")
            f = tc.get("function", {})
            tool_name = f.get("name", "")
            try:
                tool_input = json.loads(f.get("arguments", "{}") or "{}")
            except json.JSONDecodeError:
                tool_input = {}

            logger.info("Tool call: %s | input: %s", tool_name, json.dumps(tool_input, default=_json_serial_default)[:200])
            result = execute_tool(tool_name, tool_input, user_id, org_id, db)
            logger.info("Tool result: %s | %s", tool_name, json.dumps(result, default=_json_serial_default)[:200])

            card = _build_action_card(tool_name, tool_input, result)
            if card:
                action_cards.append(card)

            tool_messages.append({"role": "tool", "tool_call_id": t_id, "content": json.dumps(result, default=_json_serial_default)})

        request_messages.extend(tool_messages)

    logger.warning("Tool loop hit MAX_TOOL_ITERATIONS=%d", MAX_TOOL_ITERATIONS)
    return "I've gathered all the information I need. Let me summarise what I found for you.", action_cards


def _build_action_card(tool_name: str, tool_input: dict, result: dict) -> dict | None:
    """
    Convert a tool result into a structured action card for the frontend.
    Returns None if no card is appropriate.
    """
    if tool_name == "submit_leave_request" and result.get("success"):
        return {
            "type": "leave_submitted",
            "title": "Leave Request Submitted",
            "leave_type": result.get("leave_type", ""),
            "start_date": result.get("start_date", ""),
            "end_date": result.get("end_date", ""),
            "days": result.get("days_requested", 0),
            "status": result.get("status", "pending"),
            "request_id": result.get("request_id", ""),
        }

    if tool_name == "check_leave_balance" and result.get("balances"):
        return {
            "type": "leave_balance",
            "title": "Leave Balance",
            "balances": result["balances"],
        }

    if tool_name == "create_calendar_event" and result.get("success"):
        return {
            "type": "event_created",
            "title": "Calendar Event Created",
            "event_title": result.get("title", ""),
            "start": result.get("start", ""),
            "end": result.get("end", ""),
            "event_id": result.get("event_id", ""),
        }

    if tool_name == "check_calendar_events" and result.get("events") is not None:
        return {
            "type": "calendar_events",
            "title": "Upcoming Events",
            "events": result.get("events", []),
        }

    if tool_name == "submit_timesheet_entry" and result.get("success"):
        return {
            "type": "timesheet_submitted",
            "title": "Timesheet Entry Submitted",
            "date": result.get("date", ""),
            "hours": result.get("hours", 0),
            "project": result.get("project", ""),
            "entry_id": result.get("entry_id", ""),
        }

    if tool_name == "check_timesheet" and result.get("entries"):
        return {
            "type": "timesheet_entries",
            "title": "Recent Timesheet",
            "entries": result.get("entries", []),
        }

    if tool_name == "check_objectives" and result.get("objectives"):
        return {
            "type": "objectives",
            "title": "Your Objectives",
            "objectives": result.get("objectives", []),
        }

    return None


# ──────────────────────────────────────────────────────────────────────────────
# Main chat endpoint
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/chat")
async def chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    org_id: UUID = Depends(get_current_org_id),
):
    """
    Chat endpoint with agentic tool-calling and context from user_context_updated.
    """
    try:
        content = (req.message or "").strip()
        if not content:
            raise HTTPException(status_code=400, detail="Message cannot be empty")

        # ── Load context files ──
        file_context = load_context_files(req.context_files)

        # ── Convert history to dicts ──
        history_dicts = []
        if req.history:
            for h in req.history:
                history_dicts.append({"role": h.role, "content": h.content})

        # ── Web search ──
        web_search_context = ""
        if _should_search(content, history_dicts):
            search_query = _build_search_query(content, history_dicts)
            web_search_context = _tavily_search(search_query)

        # ── Process attachments (OpenAI format: image_url with data URL) ──
        image_blocks = []
        if req.attachments:
            for att in req.attachments:
                if att.image_base64 and att.media_type:
                    image_blocks.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:{att.media_type};base64,{att.image_base64}"},
                    })
                elif att.extracted_text:
                    content += f"\n\n[Attached file: {att.filename}]\n{att.extracted_text}"

        final_user_message = content
        if file_context:
            final_user_message = file_context + "\n\n" + content

        # ── Model (OpenAI only) ──
        chosen = OPENAI_MODEL

        # ── Build enhanced user context (direct report data, objectives, etc.) ──
        # IMPORTANT: Use a FRESH database session to avoid transaction state issues
        # from earlier operations like assemble_prompt()
        user_context = ""
        try:
            from app.database import SessionLocal
            fresh_db = SessionLocal()
            try:
                user_context = build_user_context(
                    db=fresh_db,
                    org_id=org_id,
                    user_id=user_id,
                    user_message=content,
                    chat_history=history_dicts,
                )
            finally:
                fresh_db.close()
        except Exception as e:
            logger.warning("Failed to build user context: %s", e)

        # ── Assemble system prompt ──
        system_prompt = assemble_prompt(
            db=db,
            org_id=org_id,
            user_id=user_id,
            user_message=content,
            chat_history=history_dicts,
        )

        # ── Append enhanced context to system prompt ──
        if user_context:
            system_prompt = system_prompt + "\n\n" + user_context

        # Sprint 6: inject agentic capability instructions and access rules
        system_prompt += (
            "\n\n## Access Control (STRICTLY ENFORCED)\n"
            "You must respect data access rights at all times:\n"
            "- **Employees** can only see their OWN data. If a regular employee asks about another person's "
            "leave balance, salary, performance, or any personal data, refuse and explain they do not have access.\n"
            "- **Managers** can see their own data AND their direct reports' data only. "
            "They cannot access data for employees outside their team.\n"
            "- **HR admins / Super admins** can access all employee data within the organisation.\n"
            "- **No one** has access to another user's chat history — never reveal or reference another person's conversations.\n"
            "If the user's role does not permit the requested access, respond: "
            "'You don't have permission to view that information.'\n\n"
            "## Agentic Capabilities\n"
            "You have tools to take actions:\n"
            "- **check_leave_balance** / **submit_leave_request** — check and request leave (use for_employee_id for managers/HR to query a team member). To amend or cancel approved leave, direct the user to the **Leave** page; their manager is notified for re-approval. Approved leave is synced to the **Calendar**.\n"
            "- **check_calendar_events** / **create_calendar_event** — view and create events. The Calendar shows approved leave; link users to **Leave** to manage or amend leave.\n"
            "- **check_timesheet** / **submit_timesheet_entry** — view and log timesheets\n"
            "- **check_objectives** — view OKRs (use for_employee_id for managers/HR)\n"
            "- **get_my_leave_applications** — leave history (for_employee_id for managers/HR)\n"
            "- **search_knowledge_base** — HR policies and company information\n\n"
            "Use these tools proactively when the user's request implies an action. "
            "Always confirm key details before submitting leave or timesheet entries. "
            "After completing an action, summarise what was done in a friendly, concise message.\n\n"
            "## NO HALLUCINATION — ABSOLUTE RULE\n"
            "1. For ANY question about company policies, allowances (DSA, per diem, imprest, mileage), "
            "leave entitlements, salary bands, or internal HR rules: ALWAYS call search_knowledge_base FIRST.\n"
            "2. Only after searching the KB may you supplement with web search results for external context "
            "(e.g. hotel listings, market rates) — clearly labelling what comes from the company KB vs the web.\n"
            "3. If search_knowledge_base returns no results, say explicitly: "
            "'I couldn't find that information in your company's documents.' "
            "NEVER invent numbers, rates, or policies. Do not use your training knowledge as a substitute "
            "for company-specific data."
        )

        if web_search_context:
            system_prompt = system_prompt + "\n" + web_search_context

        # ── Crisis detection ──
        crisis_result = None
        screen_level = quick_safety_screen(content)
        if screen_level != "none":
            crisis_result = analyze_safety(content, history_dicts)
            if crisis_result["recommended_action"] in ("safety_check", "crisis_response"):
                try:
                    from app.models.wellbeing import OrgCrisisConfig
                    org_config = db.query(OrgCrisisConfig).filter(OrgCrisisConfig.org_id == org_id).first()
                    config_dict = {"custom_helplines": org_config.custom_helplines} if org_config else None
                except Exception:
                    config_dict = None
                helplines = get_helplines(country_code=None, org_config=config_dict)
                helplines_text = format_helplines_for_prompt(helplines)
                safety_injection = get_safety_prompt_injection(crisis_result["risk_level"], helplines_text)
                if safety_injection:
                    system_prompt = safety_injection + "\n\n" + system_prompt

        logger.info(
            "model=%s  user=%s  msg_chars=%d  system_chars=%d  web_search=%s",
            chosen, user_id, len(final_user_message), len(system_prompt),
            "yes" if web_search_context else "no",
        )

        # ── Build messages list ──
        messages = []
        if req.history:
            for h in req.history[-20:]:
                role_label = "assistant" if h.role == "assistant" else "user"
                # History messages that are plain strings — tool_use turns in history
                # are complex; for simplicity we only replay text turns.
                if isinstance(h.content, str):
                    messages.append({"role": role_label, "content": h.content})

        if image_blocks:
            user_content = [*image_blocks, {"type": "text", "text": final_user_message}]
        else:
            user_content = final_user_message

        messages.append({"role": "user", "content": user_content})

        # ── Run agentic loop ──
        # Use a fresh session so that any failed transaction in the prompt-assembly
        # phase (assemble_prompt, crisis detection, etc.) does not poison tool queries.
        from app.database import SessionLocal as _AgentSessionLocal
        agent_db = _AgentSessionLocal()
        try:
            reply_text, action_cards = _run_agentic_loop(
                messages=messages,
                system_prompt=system_prompt,
                chosen_model=chosen,
                user_id=user_id,
                org_id=org_id,
                db=agent_db,
            )
        finally:
            agent_db.close()

        reply_text = reply_text or "..."

        # ── Create crisis alert if needed ──
        if crisis_result and crisis_result["risk_level"] in ("high", "critical"):
            try:
                from app.models.wellbeing import CrisisAlert
                from app.database import SessionLocal as _CrisisSessionLocal
                import uuid as _uuid_mod

                crisis_db = _CrisisSessionLocal()
                try:
                    session_uuid = None
                    if req.session_id:
                        try:
                            session_uuid = _uuid_mod.UUID(str(req.session_id))
                        except ValueError:
                            pass
                    alert = CrisisAlert(
                        user_id=user_id,
                        org_id=org_id,
                        session_id=session_uuid,
                        risk_level=crisis_result["risk_level"],
                        trigger_text=content[:500],
                        detected_patterns=crisis_result.get("detected_patterns"),
                        status="open",
                    )
                    crisis_db.add(alert)
                    crisis_db.commit()
                    logger.warning("CRISIS ALERT created: user=%s level=%s", user_id, crisis_result["risk_level"])
                except Exception as e:
                    logger.error("Failed to create crisis alert: %s", e)
                    crisis_db.rollback()
                finally:
                    crisis_db.close()
            except Exception as e:
                logger.error("Crisis alert session error: %s", e)

        # ── Persist chat messages ──
        session_id_out = req.session_id
        try:
            from app.models.chat_session import ChatSession, ChatMessage
            from app.database import SessionLocal

            persist_db = SessionLocal()
            try:
                if not req.session_id:
                    title = content[:50].strip() or "New Chat"
                    session = ChatSession(user_id=user_id, org_id=org_id, title=title)
                    persist_db.add(session)
                    persist_db.flush()
                    session_id_out = str(session.id)
                    logger.info("Created new chat session %s for user %s", session_id_out, user_id)
                else:
                    session = persist_db.query(ChatSession).filter(ChatSession.id == req.session_id).first()
                    if session:
                        from sqlalchemy.sql import func
                        session.updated_at = func.now()
                    else:
                        logger.warning("Session %s not found, creating new session", req.session_id)
                        title = content[:50].strip() or "New Chat"
                        session = ChatSession(user_id=user_id, org_id=org_id, title=title)
                        persist_db.add(session)
                        persist_db.flush()
                        session_id_out = str(session.id)

                if session_id_out:
                    # Store action cards JSON alongside the assistant message for
                    # potential future replay (schema permitting).
                    assistant_content = reply_text
                    persist_db.add(ChatMessage(session_id=session_id_out, role="user", content=content))
                    persist_db.add(ChatMessage(session_id=session_id_out, role="assistant", content=assistant_content))
                    persist_db.commit()
                    logger.info("Persisted 2 messages to session %s", session_id_out)
            except Exception as e:
                logger.error("Failed to persist chat message: %s — %s", e, traceback.format_exc())
                persist_db.rollback()
            finally:
                persist_db.close()
        except Exception as e:
            logger.error("Failed to create persist session: %s", e)

        # ── Background sentiment analysis ──
        try:
            analyze_sentiment_background(
                user_message=content,
                assistant_reply=reply_text,
                user_id=user_id,
                org_id=org_id,
                session_id=session_id_out,
            )
        except Exception as e:
            logger.warning("Failed to launch background sentiment analysis: %s", e)

        return ChatResponse(
            reply=reply_text,
            session_id=session_id_out,
            action_cards=action_cards if action_cards else None,
        )

    except HTTPException:
        raise
    except Exception:
        logger.error("CHAT 500 TRACEBACK:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error")
