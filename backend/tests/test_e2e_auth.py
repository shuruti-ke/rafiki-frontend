"""End-to-end API tests for auth flows."""
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_returns_200():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_health_ready_returns_200_or_503():
    r = client.get("/health/ready")
    assert r.status_code in (200, 503)
    data = r.json()
    assert "ok" in data
    assert "status" in data
    if r.status_code == 200:
        assert data["database"] == "ok"


def test_verify_code_invalid_returns_404():
    r = client.post("/auth/verify-code", json={"code": "nonexistent-org-code-xyz"})
    assert r.status_code == 404
    assert "not found" in r.json().get("detail", "").lower()


def test_login_invalid_credentials_returns_401():
    r = client.post(
        "/auth/login",
        json={"email": "nonexistent@test.local", "password": "wrong"},
    )
    assert r.status_code == 401
    assert "invalid" in r.json().get("detail", "").lower() or "invalid" in str(r.json()).lower()


def test_me_without_token_returns_401():
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_me_with_invalid_token_returns_401():
    r = client.get("/auth/me", headers={"Authorization": "Bearer invalid-token"})
    assert r.status_code == 401


def test_demo_login_invalid_role_returns_400():
    r = client.post("/auth/demo-login", json={"role": "invalid_role"})
    assert r.status_code == 400


def test_login_success_and_me():
    """Requires bootstrapped e2e@test.local. Run bootstrap_admin in CI."""
    r = client.post(
        "/auth/login",
        json={
            "email": "e2e@test.local",
            "password": "E2ETestPass123!",
            "org_code": "e2e-org",
        },
    )
    if r.status_code == 404:
        pytest.skip("Bootstrap not run; no e2e org")
    if r.status_code == 401:
        pytest.skip("Bootstrap not run; no e2e user")
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["user"]["email"] == "e2e@test.local"
    token = data["access_token"]
    me_r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_r.status_code == 200
    assert me_r.json()["email"] == "e2e@test.local"
