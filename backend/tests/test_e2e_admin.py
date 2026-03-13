"""End-to-end API tests for admin flows."""
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_employees_list_requires_auth():
    r = client.get("/api/v1/employees/")
    assert r.status_code == 401


def test_org_profile_requires_auth():
    r = client.get("/api/v1/org-config/profile")
    assert r.status_code == 401


def test_custom_reports_requires_auth():
    r = client.get("/api/v1/custom-reports/")
    assert r.status_code == 401


def test_workflows_my_requires_auth():
    r = client.get("/api/v1/workflows/my")
    assert r.status_code == 401


def test_leave_admin_applications_requires_auth():
    r = client.get("/api/v1/leave/admin/applications")
    assert r.status_code == 401
