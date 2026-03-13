import importlib

import pytest


def _reload_auth(monkeypatch, *, jwt_secret="test-secret", app_env="test", auth_mode="jwt"):
    monkeypatch.setenv("APP_ENV", app_env)
    monkeypatch.setenv("AUTH_MODE", auth_mode)
    if jwt_secret is None:
      monkeypatch.delenv("JWT_SECRET", raising=False)
      monkeypatch.delenv("SECRET_KEY", raising=False)
    else:
      monkeypatch.setenv("JWT_SECRET", jwt_secret)

    import app.config as config
    import app.services.auth as auth

    importlib.reload(config)
    return importlib.reload(auth)


def test_create_and_decode_token_round_trip(monkeypatch):
    auth = _reload_auth(monkeypatch, jwt_secret="round-trip-secret")

    token = auth.create_access_token({"sub": "user-123"})
    payload = auth.decode_access_token(token)

    assert payload is not None
    assert payload["sub"] == "user-123"
    assert "exp" in payload


def test_missing_secret_raises_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AUTH_MODE", "jwt")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("SECRET_KEY", raising=False)

    import app.config as config
    import app.services.auth as auth

    importlib.reload(config)
    with pytest.raises(RuntimeError):
        importlib.reload(auth)


def test_development_mode_uses_safe_dev_secret(monkeypatch):
    auth = _reload_auth(monkeypatch, jwt_secret=None, app_env="development", auth_mode="demo")

    token = auth.create_access_token({"sub": "demo-user"})
    payload = auth.decode_access_token(token)

    assert payload is not None
    assert payload["sub"] == "demo-user"
