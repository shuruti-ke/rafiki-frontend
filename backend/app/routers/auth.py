"""
Authentication router — login and company code verification.
"""

import os
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import Organization, User

router = APIRouter(prefix="/auth", tags=["auth"])

JWT_SECRET = os.getenv("JWT_SECRET", "rafiki-dev-secret-change-in-prod")
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24"))


# ---------- helpers ----------

def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}${h.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, h = stored.split("$", 1)
        expected = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
        return hmac.compare_digest(expected.hex(), h)
    except Exception:
        return False


def _create_token(user: User) -> str:
    """Simple HMAC-based token: user_id.role.org_id.exp.signature"""
    exp = int((datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)).timestamp())
    payload = f"{user.id}.{user.role}.{user.org_id or 0}.{exp}"
    sig = hmac.new(JWT_SECRET.encode(), payload.encode(), "sha256").hexdigest()[:32]
    return f"{payload}.{sig}"


def verify_token(token: str) -> dict:
    """Returns {user_id, role, org_id} or raises."""
    try:
        parts = token.rsplit(".", 1)
        if len(parts) != 2:
            raise ValueError
        payload, sig = parts
        expected = hmac.new(JWT_SECRET.encode(), payload.encode(), "sha256").hexdigest()[:32]
        if not hmac.compare_digest(sig, expected):
            raise ValueError
        user_id_s, role, org_id_s, exp_s = payload.split(".")
        if int(exp_s) < int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("expired")
        return {"user_id": int(user_id_s), "role": role, "org_id": int(org_id_s)}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ---------- schemas ----------

class VerifyCodeRequest(BaseModel):
    code: str

class VerifyCodeResponse(BaseModel):
    org_id: int
    org_name: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    org_code: str | None = None

class LoginResponse(BaseModel):
    token: str
    role: str
    user: dict


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

    # If org_code provided, verify the user belongs to that org
    if body.org_code:
        org = db.query(Organization).filter(Organization.code == body.org_code.strip().lower()).first()
        if not org:
            raise HTTPException(status_code=404, detail="Company code not found")
        if user.org_id != org.id:
            raise HTTPException(status_code=403, detail="You do not belong to this organization")

    token = _create_token(user)
    return LoginResponse(
        token=token,
        role=user.role,
        user={"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role, "org_id": user.org_id},
    )
