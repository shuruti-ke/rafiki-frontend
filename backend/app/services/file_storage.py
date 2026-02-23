import os
import uuid
import logging
from pathlib import Path
from fastapi import UploadFile, HTTPException

import boto3
from botocore.config import Config

logger = logging.getLogger(__name__)

# R2 configuration
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "").strip()
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
R2_ENDPOINT = os.getenv("R2_ENDPOINT", "").strip()
R2_BUCKET = os.getenv("R2_BUCKET", "rafiki-uploads").strip()

# Initialize S3 client for R2
_s3_client = None


def _get_s3():
    global _s3_client
    if _s3_client is None:
        if not all([R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT]):
            raise RuntimeError(
                "R2 storage not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT."
            )
        _s3_client = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
    return _s3_client


# Option A: allow .doc and .docx
# Also: allow common image types (broad but still safe)
ALLOWED_MIME_TYPES = {
    # Docs
    "application/pdf",
    "application/msword",  # .doc  ✅ added
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "text/plain",
    "text/csv",

    # Spreadsheets (payroll)
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "application/vnd.ms-excel",  # .xls

    # Images (common)
    "image/png",
    "image/jpeg",
    "image/jpg",   # some clients send this
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/tiff",
    "image/x-icon",
    "image/svg+xml",
    "image/heic",
    "image/heif",
    "image/avif",
}

# Fallback allowlist by extension (helps when browsers send application/octet-stream)
ALLOWED_EXTENSIONS = {
    # Docs
    ".pdf", ".doc", ".docx", ".txt", ".csv", ".xlsx", ".xls",
    # Images
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff",
    ".ico", ".svg", ".heic", ".heif", ".avif",
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


def save_upload(file: UploadFile, subfolder: str = "documents") -> tuple[str, str, int]:
    """Upload file to Cloudflare R2. Returns (r2_key, original_name, size)."""
    original_name = Path(file.filename).name if file.filename else "unnamed"
    ext = Path(original_name).suffix.lower()

    content_type = (file.content_type or "").lower().strip()

    # Validate type using MIME OR extension (to avoid false negatives from browsers)
    mime_ok = bool(content_type) and (content_type in ALLOWED_MIME_TYPES)
    ext_ok = ext in ALLOWED_EXTENSIONS

    if not mime_ok and not ext_ok:
        # Keep original error style for debugging
        raise HTTPException(status_code=400, detail=f"File type not allowed: {file.content_type}")

    content = file.file.read()
    size = len(content)

    if size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")
    if size == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    unique_name = f"{uuid.uuid4().hex}{ext}"
    r2_key = f"{subfolder}/{unique_name}"

    # If MIME is missing or generic, choose a reasonable default based on extension
    if not content_type or content_type in {"application/octet-stream", "binary/octet-stream"}:
        # Basic mapping for better ContentType on download
        guessed = {
            ".pdf": "application/pdf",
            ".doc": "application/msword",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".txt": "text/plain",
            ".csv": "text/csv",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".gif": "image/gif",
            ".bmp": "image/bmp",
            ".tif": "image/tiff",
            ".tiff": "image/tiff",
            ".ico": "image/x-icon",
            ".svg": "image/svg+xml",
            ".heic": "image/heic",
            ".heif": "image/heif",
            ".avif": "image/avif",
        }.get(ext, "application/octet-stream")
        content_type = guessed

    try:
        s3 = _get_s3()
        s3.put_object(
            Bucket=R2_BUCKET,
            Key=r2_key,
            Body=content,
            ContentType=content_type,
        )
        logger.info(f"Uploaded to R2: {r2_key} ({size} bytes)")
    except Exception as e:
        logger.error(f"R2 upload failed: {e}")
        raise HTTPException(status_code=500, detail="File upload failed")

    return r2_key, original_name, size


def get_download_url(r2_key: str, expires_in: int = 3600) -> str:
    """Generate a presigned URL for downloading a file from R2."""
    try:
        s3 = _get_s3()
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": R2_BUCKET, "Key": r2_key},
            ExpiresIn=expires_in,
        )
        return url
    except Exception as e:
        logger.error(f"Failed to generate presigned URL for {r2_key}: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate download link")


def delete_file(r2_key: str) -> bool:
    """Delete a file from R2."""
    try:
        s3 = _get_s3()
        s3.delete_object(Bucket=R2_BUCKET, Key=r2_key)
        logger.info(f"Deleted from R2: {r2_key}")
        return True
    except Exception as e:
        logger.error(f"R2 delete failed for {r2_key}: {e}")
        return False