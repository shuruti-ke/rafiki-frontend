"""
Authentication router — login and company code verification.
"""

import os
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import Organization, User
from app.services.auth import (
    create_access_token,
    decode_access_token,
    verify_password as _verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24"))


# ---------- helpers ----------

def _create_token(user: User) -> str:
    """JWT 'sub' should be the UUID user_id as a string."""
    return create_access_token(
        data={"sub": str(user.user_id)},
        expires_delta=timedelta(hours=JWT_EXPIRY_HOURS),
    )


def verify_token(token: str) -> dict:
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    return {"user_id": user_id}


# ---------- schemas ----------

class VerifyCodeRequest(BaseModel):
    code: str


class VerifyCodeResponse(BaseModel):
    org_id: str
    org_name: str


class LoginRequest(BaseModel):
    email: str
    password: str
    org_code: str | None = None


class UserOut(BaseModel):
    user_id: str
    email: str | None
    full_name: str | None
    role: str
    org_id: str | None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- endpoints ----------

@router.post("/verify-code", response_model=VerifyCodeResponse)
def verify_code(body: VerifyCodeRequest, db: Session = Depends(get_db)):
    code = body.code.strip()
    org = db.query(Organization).filter(Organization.org_code == code).first()
    if not org:
        raise HTTPException(status_code=404, detail="Company code not found")

    return VerifyCodeResponse(org_id=str(org.org_id), org_name=org.name)


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if not user or not _verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.is_active is False:
        raise HTTPException(status_code=403, detail="Account disabled")

    # If org_code provided, verify the user belongs to that org
    if body.org_code:
        org_code = body.org_code.strip()
        org = db.query(Organization).filter(Organization.org_code == org_code).first()
        if not org:
            raise HTTPException(status_code=404, detail="Company code not found")
        if str(user.org_id) != str(org.org_id):
            raise HTTPException(status_code=403, detail="You do not belong to this organization")

    token = _create_token(user)

    return LoginResponse(
        access_token=token,
        user=UserOut(
            user_id=str(user.user_id),
            email=user.email,
            full_name=user.name,
            role=str(user.role),
            org_id=str(user.org_id) if user.org_id else None,
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

    user = db.query(User).filter(User.user_id == payload["user_id"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return UserOut(
        user_id=str(user.user_id),
        email=user.email,
        full_name=user.name,
        role=str(user.role),
        org_id=str(user.org_id) if user.org_id else None,
    )
