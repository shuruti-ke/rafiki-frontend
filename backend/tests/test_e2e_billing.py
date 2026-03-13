"""End-to-end API tests for super-admin billing flows."""
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _get_super_admin_token():
    r = client.post(
        "/auth/login",
        json={"email": "e2e@test.local", "password": "E2ETestPass123!", "org_code": "e2e-org"},
    )
    if r.status_code != 200:
        return None
    return r.json().get("access_token")


def test_billing_overview_requires_auth():
    r = client.get("/super-admin/billing/overview")
    assert r.status_code == 401


def test_super_admin_stats_requires_auth():
    r = client.get("/super-admin/stats")
    assert r.status_code == 401


def test_super_admin_orgs_requires_auth():
    r = client.get("/super-admin/orgs")
    assert r.status_code == 401


def test_billing_overview_with_super_admin():
    """Requires bootstrapped e2e@test.local as super_admin."""
    token = _get_super_admin_token()
    if not token:
        pytest.skip("Bootstrap not run; no e2e super admin")
    r = client.get(
        "/super-admin/billing/overview",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "summary" in data
    assert "organizations" in data
