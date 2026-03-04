import logging
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session
from app.models.document import Document, DocumentChunk

logger = logging.getLogger(__name__)


def search_chunks(db: Session, org_id: int, query: str, limit: int = 5) -> list[dict]:
    """Search document chunks using PostgreSQL full-text search with ILIKE fallback."""
    if not query or not query.strip():
        return []

    # Try full-text search first (OR-style so partial matches still rank)
    results = _fts_search(db, org_id, query, limit)

    # Fallback to ILIKE keyword search if no FTS results
    if not results:
        results = _ilike_search(db, org_id, query, limit)

    logger.debug("KB search for '%s': %d chunks found", query[:60], len(results))
    return results


# Stop-words to strip from ILIKE keyword searches
_STOP_WORDS = {
    "i", "me", "my", "the", "a", "an", "is", "are", "was", "were", "do", "does",
    "did", "have", "has", "had", "can", "could", "will", "would", "should",
    "how", "what", "when", "where", "who", "which", "many", "much", "in", "on",
    "at", "to", "for", "of", "and", "or", "but", "not", "this", "that", "it",
    "be", "been", "being", "am", "your", "our", "their", "its", "with",
}


def _fts_search(db: Session, org_id: int, query: str, limit: int) -> list[dict]:
    # Build an OR-style tsquery so chunks matching ANY keyword are returned,
    # ranked by how many keywords match. This replaces the old AND-style
    # plainto_tsquery which required ALL words to be present in a chunk.
    words = [w for w in query.lower().split() if w.isalpha() and w not in _STOP_WORDS]
    if not words:
        or_query = query
    else:
        # " | " is the OR operator in tsquery syntax
        or_query = " | ".join(words[:8])

    sql = sa_text("""
        SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, dc.token_count,
               ts_rank(to_tsvector('english', dc.content),
                       to_tsquery('english', :or_query)) AS rank
        FROM document_chunks dc
        WHERE dc.org_id = :org_id
          AND to_tsvector('english', dc.content) @@ to_tsquery('english', :or_query)
        ORDER BY rank DESC
        LIMIT :limit
    """)

    rows = db.execute(sql, {
        "org_id": org_id,
        "or_query": or_query,
        "limit": limit,
    }).fetchall()

    return [
        {
            "chunk_id": row[0],
            "document_id": row[1],
            "chunk_index": row[2],
            "content": row[3],
            "token_count": row[4],
            "rank": float(row[5]),
        }
        for row in rows
    ]


def _ilike_search(db: Session, org_id: int, query: str, limit: int) -> list[dict]:
    # Extract meaningful keywords and search for ANY of them individually
    words = [w for w in query.lower().split() if len(w) >= 3 and w not in _STOP_WORDS]
    if not words:
        words = [query.strip()]

    from sqlalchemy import or_
    conditions = [DocumentChunk.content.ilike(f"%{w}%") for w in words[:6]]

    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.org_id == org_id, or_(*conditions))
        .limit(limit)
        .all()
    )

    return [
        {
            "chunk_id": c.id,
            "document_id": c.document_id,
            "chunk_index": c.chunk_index,
            "content": c.content,
            "token_count": c.token_count,
            "rank": 0.0,
        }
        for c in chunks
    ]


def format_kb_context(chunks: list[dict], documents: dict[int, Document]) -> str:
    """Format search results as prompt context with source citations."""
    if not chunks:
        return ""

    lines = [
        "KNOWLEDGE BASE CONTEXT:",
        "The following information comes from the organization's official documents. "
        "Cite the source document name when referencing this information.\n",
    ]

    for chunk in chunks:
        doc = documents.get(chunk["document_id"])
        source_name = doc.title if doc else f"Document #{chunk['document_id']}"
        version = f" v{doc.version}" if doc else ""
        lines.append(f"[Source: {source_name}{version}]")
        lines.append(chunk["content"])
        lines.append("")

    return "\n".join(lines)
