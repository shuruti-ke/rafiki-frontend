import os

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTH_MODE", "jwt")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
