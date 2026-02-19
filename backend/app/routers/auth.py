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
        data={"sub": str(user.id)},
        expires_delta=timedelta(hours=JWT_EXPIRY_HOURS),
    )


def verify_token(token: str) -> dict:
    """Returns {user_id, role, org_id} or raises."""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_id = int(payload["sub"])
    return {"user_id": user_id}


# ---------- schemas ----------

class VerifyCodeRequest(BaseModel):
    code: str

class VerifyCodeResponse(BaseModel):
    org_id: int
    org_name: str

class LoginRequest(BaseModel):
    email: str
    password: str
    org_code: str | None = None

class UserOut(BaseModel):
    id: int
    email: str
    full_name: str | None
    role: str
    org_id: int | None

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- endpoints ----------

@router.post("/verify-code", response_model=VerifyCodeResponse)
def verify_code(body: VerifyCodeRequest, db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.code == body.code.strip().lower()).first()
    if not org:
        raise HTTPException(status_code=404, detail="Company code not found")
    return VerifyCodeResponse(org_id=org.id, org_name=org.name)


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if not user or not _verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if hasattr(user, "is_active") and not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    # If org_code provided, verify the user belongs to that org
    if body.org_code:
        org = db.query(Organization).filter(Organization.code == body.org_code.strip().lower()).first()
        if not org:
            raise HTTPException(status_code=404, detail="Company code not found")
        if user.org_id != org.id:
            raise HTTPException(status_code=403, detail="You do not belong to this organization")

    token = _create_token(user)
    return LoginResponse(
        access_token=token,
        user=UserOut(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            org_id=user.org_id,
        ),
    )


@router.get("/me", response_model=UserOut)
def me(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.removeprefix("Bearer ").strip()
    payload = verify_token(token)

    user = db.query(User).filter(User.id == payload["user_id"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        org_id=user.org_id,
    )
