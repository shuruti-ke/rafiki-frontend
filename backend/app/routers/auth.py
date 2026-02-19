"""
Authentication router — login and company code verification.
"""

import os
import hashlib
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models.user import Organization, User
from app.services.auth import (
    create_access_token,
    decode_access_token,
    verify_password as _verify_password,
    get_password_hash,
)

router = APIRouter(prefix="/auth", tags=["auth"])

JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24"))


# ---------- helpers ----------

def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}${h.hex()}"


def _create_token(user: User) -> str:
    """Create a JWT token compatible with dependencies.py."""
    return create_access_token(
        data={"sub": str(user.id)},  # keep as string
        expires_delta=timedelta(hours=JWT_EXPIRY_HOURS),
    )


def verify_token(token: str) -> dict:
    """Returns {user_id} or raises."""
    payload = decode_access_token(toke
