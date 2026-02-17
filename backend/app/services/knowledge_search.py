import logging
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session
from app.models.document import Document, DocumentChunk

logger = logging.getLogger(__name__)


def search_chunks(db: Session, org_id: int, query: str, limit: int = 5) -> list[dict]:
    """Search document chunks using PostgreSQL full-text search with ILIKE fallback."""
    if not query or not query.strip():
        return []

    # Try full-text search first
    results = _fts_search(db, org_id, query, limit)

    # Fallback to ILIKE if no FTS results
    if not results:
        results = _ilike_search(db, org_id, query, limit)

    return results


def _fts_search(db: Session, org_id: int, query: str, limit: int) -> list[dict]:
    sql = sa_text("""
        SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, dc.token_count,
               ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', :query)) AS rank
        FROM document_chunks dc
        WHERE dc.org_id = :org_id
          AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', :query)
        ORDER BY rank DESC
        LIMIT :limit
    """)

    rows = db.execute(sql, {"org_id": org_id, "query": query, "limit": limit}).fetchall()

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
    pattern = f"%{query}%"
    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.org_id == org_id, DocumentChunk.content.ilike(pattern))
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
