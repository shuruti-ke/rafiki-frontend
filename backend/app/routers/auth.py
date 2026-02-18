from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.auth import verify_password, create_access_token, decode_access_token


# --- Routers (these names MUST exist because main.py imports them) ---
router = APIRouter(prefix="/auth", tags=["auth"])
v1_router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
super_admin_router = APIRouter(prefix="/super-admin", tags=["auth"])
super_admin_v1_router = APIRouter(prefix="/api/v1/super-admin", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: str
    org_id: Optional[int] = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


def _login(body: LoginRequest, db: Session) -> LoginResponse:
    user = db.query(User).filter(User.email == body.email).first()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not getattr(user, "is_active", True):
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_access_token({"sub": str(user.id), "role": user.role, "org_id": user.org_id})

    return LoginResponse(
        access_token=token,
        user=UserOut(
            id=user.id,
            email=user.email,
            full_name=getattr(user, "full_name", None),
            role=user.role,
            org_id=user.org_id,
        ),
    )


def _require_user(db: Session, authorization: Optional[str]) -> UserOut:
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.replace("Bearer", "").strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return UserOut(
        id=user.id,
        email=user.email,
        full_name=getattr(user, "full_name", None),
        role=user.role,
        org_id=user.org_id,
    )


def _login_super_admin(body: LoginRequest, db: Session) -> LoginResponse:
    res = _login(body, db)
    if res.user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return res


def _me_super_admin(db: Session, authorization: Optional[str]) -> UserOut:
    user = _require_user(db, authorization)
    if user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user


# --- Standard auth ---
@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    return _login(body, db)


@v1_router.post("/login", response_model=LoginResponse)
def login_v1(body: LoginRequest, db: Session = Depends(get_db)):
    return _login(body, db)


@router.get("/me", response_model=UserOut)
def me(db: Session = Depends(get_db), authorization: Optional[str] = Header(default=None)):
    return _require_user(db, authorization)


@v1_router.get("/me", response_model=UserOut)
def me_v1(db: Session = Depends(get_db), authorization: Optional[str] = Header(default=None)):
    return _require_user(db, authorization)


# --- Super admin (what your Vercel bundle calls) ---
@v1_router.post("/super-admin-login", response_model=LoginResponse)
def super_admin_login_hyphen(body: LoginRequest, db: Session = Depends(get_db)):
    return _login_super_admin(body, db)


# Also support the nicer slash route
@v1_router.post("/super-admin/login", response_model=LoginResponse)
def super_admin_login_slash(body: LoginRequest, db: Session = Depends(get_db)):
    return _login_super_admin(body, db)


# Also support /api/v1/super-admin/login
@super_admin_v1_router.post("/login", response_model=LoginResponse)
def super_admin_login_direct(body: LoginRequest, db: Session = Depends(get_db)):
    return _login_super_admin(body, db)


@v1_router.get("/super-admin/me", response_model=UserOut)
def super_admin_me_v1(db: Session = Depends(get_db), authorization: Optional[str] = Header(default=None)):
    return _me_super_admin(db, authorization)
