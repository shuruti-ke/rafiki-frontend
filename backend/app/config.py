import logging
import os

logger = logging.getLogger(__name__)

_DEV_ENVS = {"development", "dev", "local", "test", "testing"}
_DEV_SECRET = "dev-insecure-jwt-secret-change-before-production"


def app_env() -> str:
    return (
        os.getenv("APP_ENV")
        or os.getenv("ENVIRONMENT")
        or ("development" if os.getenv("AUTH_MODE", "demo").lower() == "demo" else "production")
    ).strip().lower()


def is_development_like() -> bool:
    return app_env() in _DEV_ENVS or os.getenv("AUTH_MODE", "demo").lower() == "demo"


def get_jwt_secret() -> str:
    secret = (os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY") or "").strip()
    if secret:
        return secret

    if is_development_like():
        logger.warning("Using development JWT secret because JWT_SECRET/SECRET_KEY is not set.")
        return _DEV_SECRET

    raise RuntimeError(
        "JWT secret is not configured. Set JWT_SECRET (preferred) or SECRET_KEY before starting the app."
    )
