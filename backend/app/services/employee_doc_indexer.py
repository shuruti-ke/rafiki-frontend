"""
Backfill script: extract text for existing employee documents that have no extracted_text.

Usage:
    cd backend && python -m app.services.employee_doc_indexer
"""
import logging
from app.database import SessionLocal
from app.models.employee_document import EmployeeDocument
from app.services.file_storage import download_file_bytes
from app.services.document_processor import extract_text_from_bytes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EXTRACTABLE_MIMES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/csv",
}


def backfill():
    db = SessionLocal()
    try:
        docs = (
            db.query(EmployeeDocument)
            .filter(
                EmployeeDocument.extracted_text.is_(None),
                EmployeeDocument.mime_type.in_(EXTRACTABLE_MIMES),
            )
            .all()
        )
        logger.info("Found %d documents to backfill", len(docs))

        for doc in docs:
            try:
                content_bytes = download_file_bytes(doc.file_path)
                text = extract_text_from_bytes(content_bytes, doc.mime_type)
                if text:
                    doc.extracted_text = text
                    db.commit()
                    logger.info("Extracted text for doc %s (%d chars)", doc.id, len(text))
                else:
                    logger.warning("No text extracted for doc %s", doc.id)
            except Exception as e:
                db.rollback()
                logger.error("Failed to process doc %s: %s", doc.id, e)

        logger.info("Backfill complete")
    finally:
        db.close()


if __name__ == "__main__":
    backfill()
