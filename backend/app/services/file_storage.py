import uuid
from pathlib import Path
from fastapi import UploadFile, HTTPException

UPLOAD_DIR = Path(__file__).parent.parent.parent / "static" / "uploads"

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/csv",
    "image/png",
    "image/jpeg",
    "image/webp",
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


async def save_upload(file: UploadFile, subfolder: str = "documents") -> tuple[str, str, int]:
    """Save an uploaded file with UUID naming. Returns (path, original_name, size)."""
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"File type not allowed: {file.content_type}")

    content = await file.read()
    size = len(content)

    if size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")

    if size == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    original_name = Path(file.filename).name if file.filename else "unnamed"
    ext = Path(original_name).suffix
    unique_name = f"{uuid.uuid4().hex}{ext}"

    dest_dir = UPLOAD_DIR / subfolder
    dest_dir.mkdir(parents=True, exist_ok=True)

    dest_path = dest_dir / unique_name
    dest_path.write_bytes(content)

    relative_path = f"static/uploads/{subfolder}/{unique_name}"
    return relative_path, original_name, size
