import logging
from sqlalchemy.orm import Session
from app.models.document import Document
from app.services.knowledge_search import search_chunks, format_kb_context

logger = logging.getLogger(__name__)

RAFIKI_SYSTEM_PROMPT = """You are Rafiki, an AI workplace wellbeing assistant created by Shoulder2LeanOn.
You provide supportive, evidence-based guidance on workplace mental health and wellbeing.
You are warm, empathetic, and culturally aware — especially attuned to East African workplace contexts.

Key principles:
- Be supportive and non-judgmental
- Provide evidence-based wellbeing guidance
- Respect privacy and confidentiality
- Escalate crisis situations appropriately
- Reference organization knowledge base documents when relevant, citing sources

When referencing information from the Knowledge Base, always cite the source document name."""


def _build_kb_context(db: Session, org_id: int, user_message: str) -> str:
    """Search document chunks matching the user's message and format as context."""
    if not user_message:
        return ""

    try:
        chunks = search_chunks(db, org_id, user_message, limit=5)
        if not chunks:
            return ""

        doc_ids = list({c["document_id"] for c in chunks})
        docs = db.query(Document).filter(Document.id.in_(doc_ids)).all()
        doc_map = {d.id: d for d in docs}

        return format_kb_context(chunks, doc_map)
    except Exception as e:
        logger.error("KB context build failed: %s", e)
        return ""


def assemble_prompt(
    db: Session | None = None,
    org_id: int = 1,
    user_context: str = "",
    user_message: str | None = None,
) -> str:
    """Assemble the full system prompt with optional KB context."""
    parts = [RAFIKI_SYSTEM_PROMPT]

    # User context (org-specific customization)
    if user_context:
        parts.append(f"\n\nUSER CONTEXT:\n{user_context}")

    # Knowledge base context (from document search)
    if db and user_message:
        kb_context = _build_kb_context(db, org_id, user_message)
        if kb_context:
            parts.append(f"\n\n{kb_context}")

    return "\n".join(parts)
