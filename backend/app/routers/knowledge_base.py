import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document import Document, DocumentChunk
from app.schemas.documents import DocumentResponse, DocumentUpdate
from app.services.file_storage import save_upload, get_download_url
from app.services.document_processor import index_document
from app.services.audit import log_action

from app.dependencies import get_current_org_id, get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/knowledge-base", tags=["Knowledge Base"])


def as_uuid(value) -> Optional[uuid.UUID]:
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return value
    return uuid.UUID(str(value))


@router.post("/upload", response_model=DocumentResponse)
def upload_document(
    file: UploadFile = File(...),
    title: str = Query(...),
    description: str = Query(default=""),
    category: str = Query(default="general"),
    tags: str = Query(default=""),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    file_path, original_name, size = save_upload(file, subfolder="documents")

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    doc = Document(
        org_id=org_id,
        title=title,
        description=description or None,
        file_path=file_path,
        original_filename=original_name,
        mime_type=file.content_type or "application/octet-stream",
        file_size=size,
        category=category,
        tags=tag_list,
        version=1,
        uploaded_by=user_id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        index_document(db, doc)
    except Exception as e:
        logger.error("Indexing failed for doc %s: %s", doc.id, e)

    log_action(db, org_id, user_id, "upload", "document", doc.id, {"title": title})
    return doc


@router.get("/", response_model=list[DocumentResponse])
def list_documents(
    category: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    q = db.query(Document).filter(
        Document.org_id == org_id,
        Document.is_current == True,
    )

    if category:
        q = q.filter(Document.category == category)

    if tag:
        q = q.filter(Document.tags.contains([tag]))

    if search:
        q = q.filter(Document.title.ilike(f"%{search}%"))

    return q.order_by(Document.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/{doc_id}", response_model=DocumentResponse)
def get_document(
    doc_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
):
    doc = (
        db.query(Document)
        .filter(Document.id == doc_id, Document.org_id == org_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/{doc_id}/download")
def download_document(
    doc_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Redirect to a presigned R2 URL for downloading the document."""
    doc = (
        db.query(Document)
        .filter(Document.id == doc_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    presigned_url = get_download_url(doc.file_path)
    return {"url": presigned_url}


@router.put("/{doc_id}", response_model=DocumentResponse)
def update_document(
    doc_id: uuid.UUID,
    update: DocumentUpdate,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    doc = (
        db.query(Document)
        .filter(Document.id == doc_id, Document.org_id == org_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)

    db.commit()
    db.refresh(doc)

    log_action(
        db,
        org_id,
        user_id,
        "update",
        "document",
        doc.id,
        update.model_dump(exclude_unset=True),
    )
    return doc


@router.delete("/{doc_id}")
def delete_document(
    doc_id: uuid.UUID,
    db: Session = Depends(get_db),
    org_id: uuid.UUID = Depends(get_current_org_id),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    doc = (
        db.query(Document)
        .filter(Document.id == doc_id, Document.org_id == org_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    doc.is_current = False
    db.commit()

    log_action(db, org_id, user_id, "delete", "document", doc.id)
    return {"ok": True, "message": "Document archived"}
