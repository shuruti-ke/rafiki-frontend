import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.document import Document, DocumentChunk
from app.schemas.documents import DocumentResponse, DocumentUpdate, DocumentSearchRequest
from app.services.file_storage import save_upload
from app.services.document_processor import index_document
from app.services.knowledge_search import search_chunks, format_kb_context
from app.services.audit import log_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/knowledge-base", tags=["Knowledge Base"])

# Placeholder for auth — in production, extract from JWT
DEMO_ORG_ID = 1
DEMO_USER_ID = 1
DEMO_IS_ADMIN = True


@router.post("/upload", response_model=DocumentResponse)
def upload_document(
    file: UploadFile = File(...),
    title: str = Query(...),
    description: str = Query(default=""),
    category: str = Query(default="general"),
    tags: str = Query(default=""),
    db: Session = Depends(get_db),
):
    file_path, original_name, size = save_upload(file, subfolder="documents")

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    doc = Document(
        org_id=DEMO_ORG_ID,
        title=title,
        description=description or None,
        file_path=file_path,
        original_filename=original_name,
        mime_type=file.content_type or "application/octet-stream",
        file_size=size,
        category=category,
        tags=tag_list,
        version=1,
        uploaded_by=DEMO_USER_ID,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Trigger indexing for text-searchable documents
    try:
        index_document(db, doc)
    except Exception as e:
        logger.error("Indexing failed for doc %d: %s", doc.id, e)

    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "upload", "document", doc.id, {"title": title})
    return doc


@router.get("/", response_model=list[DocumentResponse])
def list_documents(
    category: str = Query(default=None),
    tag: str = Query(default=None),
    search: str = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(Document).filter(
        Document.org_id == DEMO_ORG_ID,
        Document.is_current == True,
    )
    if category:
        q = q.filter(Document.category == category)
    if tag:
        q = q.filter(Document.tags.contains([tag]))
    if search:
        q = q.filter(Document.title.ilike(f"%{search}%"))

    return q.order_by(Document.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/search")
def search_documents(
    query: str = Query(...),
    limit: int = Query(default=5, le=20),
    db: Session = Depends(get_db),
):
    chunks = search_chunks(db, DEMO_ORG_ID, query, limit)
    if not chunks:
        return {"results": [], "context": ""}

    doc_ids = list({c["document_id"] for c in chunks})
    docs = db.query(Document).filter(Document.id.in_(doc_ids)).all()
    doc_map = {d.id: d for d in docs}

    results = []
    for c in chunks:
        doc = doc_map.get(c["document_id"])
        results.append({
            "chunk_id": c["chunk_id"],
            "document_id": c["document_id"],
            "document_title": doc.title if doc else "Unknown",
            "content_preview": c["content"][:200],
            "rank": c["rank"],
        })

    context = format_kb_context(chunks, doc_map)
    return {"results": results, "context": context}


@router.get("/{doc_id}", response_model=DocumentResponse)
def get_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(
        Document.id == doc_id, Document.org_id == DEMO_ORG_ID
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.put("/{doc_id}", response_model=DocumentResponse)
def update_document(doc_id: int, update: DocumentUpdate, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(
        Document.id == doc_id, Document.org_id == DEMO_ORG_ID
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)

    db.commit()
    db.refresh(doc)

    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "update", "document", doc.id, update.model_dump(exclude_unset=True))
    return doc


@router.delete("/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(
        Document.id == doc_id, Document.org_id == DEMO_ORG_ID
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    doc.is_current = False
    db.commit()

    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "delete", "document", doc.id)
    return {"ok": True, "message": "Document archived"}


@router.post("/{doc_id}/new-version", response_model=DocumentResponse)
def upload_new_version(
    doc_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    parent = db.query(Document).filter(
        Document.id == doc_id, Document.org_id == DEMO_ORG_ID
    ).first()
    if not parent:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path, original_name, size = save_upload(file, subfolder="documents")

    new_doc = Document(
        org_id=DEMO_ORG_ID,
        title=parent.title,
        description=parent.description,
        file_path=file_path,
        original_filename=original_name,
        mime_type=file.content_type or parent.mime_type,
        file_size=size,
        category=parent.category,
        tags=parent.tags,
        version=parent.version + 1,
        parent_id=parent.id,
        uploaded_by=DEMO_USER_ID,
    )

    parent.is_current = False
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)

    try:
        index_document(db, new_doc)
    except Exception as e:
        logger.error("Indexing failed for new version %d: %s", new_doc.id, e)

    log_action(db, DEMO_ORG_ID, DEMO_USER_ID, "new_version", "document", new_doc.id, {"parent_id": parent.id, "version": new_doc.version})
    return new_doc


@router.get("/{doc_id}/versions", response_model=list[DocumentResponse])
def get_version_history(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(
        Document.id == doc_id, Document.org_id == DEMO_ORG_ID
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Walk up to root
    root_id = doc_id
    current = doc
    while current.parent_id:
        root_id = current.parent_id
        current = db.query(Document).filter(Document.id == current.parent_id).first()
        if not current:
            break

    # Get all versions in chain
    versions = []
    _collect_versions(db, root_id, versions)
    return sorted(versions, key=lambda d: d.version, reverse=True)


def _collect_versions(db: Session, doc_id: int, versions: list):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if doc:
        versions.append(doc)
        children = db.query(Document).filter(Document.parent_id == doc_id).all()
        for child in children:
            _collect_versions(db, child.id, versions)
