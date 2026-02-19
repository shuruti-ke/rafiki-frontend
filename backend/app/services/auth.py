import hashlib
import secrets
import os
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

# Bcrypt for NEW passwords
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Configuration - SHOULD come from environment
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify password against BOTH formats:
    - Legacy: salt$hash (PBKDF2-SHA256 OR sha256(salt+password))
    - New: bcrypt ($2b$... / $2a$...)
    """
    if not hashed_password:
        return False

    # bcrypt
    if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
        try:
            return pwd_context.verify(plain_password, hashed_password)
        except Exception:
            return False

    # legacy salt$hash
    try:
        salt, hash_value = hashed_password.split("$", 1)

        # PBKDF2-HMAC-SHA256 (100k iterations)
        computed = hashlib.pbkdf2_hmac("sha256", plain_password.encode(), salt.encode(), 100_000)
        if secrets.compare_digest(computed.hex(), hash_value):
            return True

        # fallback: SHA256(salt + password)
        computed_hash = hashlib.sha256((salt + plain_password).encode()).hexdigest()
        return secrets.compare_digest(computed_hash, hash_value)

    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Generate NEW bcrypt hash for new passwords."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None
