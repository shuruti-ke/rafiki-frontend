"""End-to-end API tests for payroll flows."""
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_payroll_templates_requires_auth():
    r = client.get("/api/v1/payroll/templates")
    assert r.status_code == 401


def test_payroll_batches_requires_auth():
    r = client.get("/api/v1/payroll/batches")
    assert r.status_code == 401


def test_payroll_approvers_requires_auth():
    r = client.get("/api/v1/payroll/approvers")
    assert r.status_code == 401


def test_payroll_my_payslips_requires_auth():
    r = client.get("/api/v1/payroll/my-payslips")
    assert r.status_code == 401


def test_payroll_upload_requires_auth():
    r = client.post("/api/v1/payroll/upload", files={"file": ("test.csv", b"a,b,c", "text/csv")})
    assert r.status_code == 401


def _get_admin_token():
    r = client.post(
        "/auth/login",
        json={"email": "e2e@test.local", "password": "E2ETestPass123!", "org_code": "e2e-org"},
    )
    if r.status_code != 200:
        return None
    return r.json().get("access_token")


def test_payroll_batches_with_admin_token():
    """Requires bootstrapped e2e@test.local. Super admin can access payroll."""
    token = _get_admin_token()
    if not token:
        pytest.skip("Bootstrap not run; no e2e admin")
    r = client.get(
        "/api/v1/payroll/batches",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)
